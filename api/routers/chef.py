"""Chef endpoints — recipes + meal logging for members — FS-3 §2."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role

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
