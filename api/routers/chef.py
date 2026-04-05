"""Chef endpoints — recipes, meal logging, dashboard, directives — FS-3/FS-4."""

from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role
from api.services.nutrition import compute_daily_totals

router = APIRouter(prefix="/chef", tags=["chef"])
chef_or_admin = require_role(["chef", "admin"])


class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    serving_size: Optional[str] = None
    calories_per_serving: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    tags: Optional[list[str]] = None


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    serving_size: Optional[str] = None
    calories_per_serving: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    tags: Optional[list[str]] = None


class ChefFoodLog(BaseModel):
    member_ids: list[str]
    log_date: str
    meal_type: str
    chef_recipe_id: str
    quantity: Optional[float] = 1
    unit: Optional[str] = "serving"


# ── Recipes ──

@router.get("/recipes")
async def list_recipes(
    request: Request,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    user: dict = Depends(chef_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    query = (
        sb.table("chef_recipes")
        .select("*")
        .eq("chef_id", user["user_id"])
        .eq("is_active", True)
        .order("created_at", desc=True)
    )
    if search:
        query = query.ilike("name", f"%{search}%")
    if tag:
        query = query.contains("tags", [tag])

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.post("/recipes")
async def create_recipe(
    body: RecipeCreate,
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    row = body.model_dump(exclude_none=True)
    row["chef_id"] = user["user_id"]

    result = sb.table("chef_recipes").insert(row).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.patch("/recipes/{recipe_id}")
async def update_recipe(
    recipe_id: str,
    body: RecipeUpdate,
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("chef_recipes")
        .select("id")
        .eq("id", recipe_id)
        .eq("chef_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Recipe not found")

    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = now
    result = sb.table("chef_recipes").update(updates).eq("id", recipe_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("chef_recipes")
        .select("id")
        .eq("id", recipe_id)
        .eq("chef_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Recipe not found")

    result = sb.table("chef_recipes").update({"is_active": False, "updated_at": now}).eq("id", recipe_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


# ── Chef food logging for members ──

@router.post("/food-logs")
async def chef_log_meal(
    body: ChefFoodLog,
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Fetch recipe for macros
    recipe = (
        sb.table("chef_recipes")
        .select("*")
        .eq("id", body.chef_recipe_id)
        .eq("chef_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not recipe.data:
        raise HTTPException(status_code=404, detail="Recipe not found")

    r = recipe.data[0]

    # Verify chef is assigned to all members
    assignments = (
        sb.table("chef_assignments")
        .select("member_id")
        .eq("chef_id", user["user_id"])
        .eq("active", True)
        .in_("member_id", body.member_ids)
        .execute()
    )
    assigned_ids = {a["member_id"] for a in (assignments.data or [])}
    unassigned = set(body.member_ids) - assigned_ids
    if unassigned and user["role"] != "admin":
        raise HTTPException(status_code=403, detail=f"Not assigned to members: {unassigned}")

    # Create one food log per member
    rows = []
    for mid in body.member_ids:
        rows.append({
            "user_id": mid,
            "log_date": body.log_date,
            "meal_type": body.meal_type,
            "source": "chef",
            "food_name": r["name"],
            "chef_recipe_id": body.chef_recipe_id,
            "quantity": body.quantity,
            "unit": body.unit,
            "calories": r.get("calories_per_serving"),
            "protein_g": r.get("protein_g"),
            "carbs_g": r.get("carbs_g"),
            "fat_g": r.get("fat_g"),
            "fiber_g": r.get("fiber_g"),
        })

    result = sb.table("food_logs").insert(rows).execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


# ── Dashboard ──

@router.get("/members")
async def list_chef_members(
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    """List assigned members with today's summary."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()
    today = date.today().isoformat()

    # Get active assignments
    assignments = (
        sb.table("chef_assignments")
        .select("member_id, member:users!chef_assignments_member_id_fkey(full_name, display_name, avatar_url)")
        .eq("chef_id", user["user_id"])
        .eq("active", True)
        .execute()
    )

    members = []
    for a in (assignments.data or []):
        mid = a["member_id"]
        member = a.get("member", {})

        # Today's food logs
        foods = (
            sb.table("food_logs")
            .select("calories, meal_type, photo_capture_status")
            .eq("user_id", mid)
            .eq("log_date", today)
            .execute()
        )
        food_data = foods.data or []
        totals = compute_daily_totals(food_data)

        # Today's workout calories
        workouts = (
            sb.table("workouts")
            .select("estimated_calories_burned")
            .eq("user_id", mid)
            .eq("log_date", today)
            .execute()
        )
        calories_out = sum(w.get("estimated_calories_burned") or 0 for w in (workouts.data or []))

        # Active directives
        directives = (
            sb.table("dietary_directives")
            .select("id", count="exact")
            .eq("chef_id", user["user_id"])
            .eq("member_id", mid)
            .eq("is_active", True)
            .execute()
        )

        members.append({
            "user_id": mid,
            "display_name": member.get("display_name") or member.get("full_name", ""),
            "avatar_url": member.get("avatar_url"),
            "today": {
                "calories_in": totals["calories_in"],
                "calories_out": calories_out,
                "meals_logged": totals["meals_logged"],
                "pending_photo_affirms": totals["pending_affirm_count"],
                "active_directives": directives.count or 0,
            },
        })

    return {"data": members, "error": None, "meta": {"timestamp": now}}


@router.get("/pending-affirms")
async def list_pending_affirms(
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    """All pending photo captures across assigned members."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get assigned member IDs
    assignments = (
        sb.table("chef_assignments")
        .select("member_id")
        .eq("chef_id", user["user_id"])
        .eq("active", True)
        .execute()
    )
    member_ids = [a["member_id"] for a in (assignments.data or [])]

    if not member_ids:
        return {"data": [], "error": None, "meta": {"timestamp": now}}

    pending = (
        sb.table("food_logs")
        .select("*, member:users!food_logs_user_id_fkey(display_name, full_name)")
        .in_("user_id", member_ids)
        .eq("photo_capture_status", "pending")
        .order("created_at")
        .execute()
    )

    return {"data": pending.data, "error": None, "meta": {"timestamp": now}}


@router.get("/directives")
async def list_chef_directives(
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    """Active dietary directives for chef's assigned members."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("dietary_directives")
        .select("*, member:users!dietary_directives_member_id_fkey(display_name, full_name)")
        .eq("chef_id", user["user_id"])
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )

    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.patch("/directives/{directive_id}/acknowledge")
async def acknowledge_directive(
    directive_id: str,
    request: Request,
    user: dict = Depends(chef_or_admin),
):
    """Chef marks a directive as seen."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("dietary_directives")
        .select("id")
        .eq("id", directive_id)
        .eq("chef_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Directive not found")

    result = (
        sb.table("dietary_directives")
        .update({"chef_acknowledged_at": now})
        .eq("id", directive_id)
        .execute()
    )
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}
