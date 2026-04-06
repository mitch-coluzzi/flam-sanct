"""Workout endpoints — FS-2 §3."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role
from api.services.calorie_burn import estimate_calories
from api.services.f3_sync import sync_member_workouts, get_dsm_ao_list

router = APIRouter(tags=["workouts"])
member_or_admin = require_role(["member", "admin"])


class WorkoutCreate(BaseModel):
    log_date: str
    workout_type: str
    workout_label: Optional[str] = None
    duration_minutes: int
    rpe: int
    is_f3: bool = False
    f3_ao: Optional[str] = None
    f3_q: Optional[str] = None
    notes: Optional[str] = None


class WorkoutUpdate(BaseModel):
    workout_type: Optional[str] = None
    workout_label: Optional[str] = None
    duration_minutes: Optional[int] = None
    rpe: Optional[int] = None
    is_f3: Optional[bool] = None
    f3_ao: Optional[str] = None
    f3_q: Optional[str] = None
    notes: Optional[str] = None


@router.post("/workouts")
async def create_workout(
    body: WorkoutCreate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get member's latest weight for calorie calc
    weight_result = (
        sb.table("daily_logs")
        .select("weight_lbs")
        .eq("user_id", user["user_id"])
        .not_.is_("weight_lbs", "null")
        .order("log_date", desc=True)
        .limit(1)
        .execute()
    )
    weight_lbs = weight_result.data[0]["weight_lbs"] if weight_result.data else 185.0

    calories = estimate_calories(
        workout_type=body.workout_type,
        duration_minutes=body.duration_minutes,
        rpe=body.rpe,
        weight_lbs=float(weight_lbs),
    )

    row = body.model_dump()
    row["user_id"] = user["user_id"]
    row["estimated_calories_burned"] = calories

    result = sb.table("workouts").insert(row).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.get("/workouts")
async def list_workouts(
    request: Request,
    log_date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    query = (
        sb.table("workouts")
        .select("*")
        .eq("user_id", user["user_id"])
        .is_("deleted_at", "null")
        .order("log_date", desc=True)
    )
    if log_date:
        query = query.eq("log_date", log_date)
    if start:
        query = query.gte("log_date", start)
    if end:
        query = query.lte("log_date", end)

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.patch("/workouts/{workout_id}")
async def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify ownership
    existing = (
        sb.table("workouts")
        .select("*")
        .eq("id", workout_id)
        .eq("user_id", user["user_id"])
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Workout not found")

    updates = body.model_dump(exclude_none=True)

    # Recalculate calories if type, duration, or RPE changed
    w = existing.data[0]
    needs_recalc = any(k in updates for k in ("workout_type", "duration_minutes", "rpe"))
    if needs_recalc:
        wt = updates.get("workout_type", w["workout_type"])
        dur = updates.get("duration_minutes", w["duration_minutes"])
        rpe = updates.get("rpe", w["rpe"])

        weight_result = (
            sb.table("daily_logs")
            .select("weight_lbs")
            .eq("user_id", user["user_id"])
            .not_.is_("weight_lbs", "null")
            .order("log_date", desc=True)
            .limit(1)
            .execute()
        )
        weight_lbs = weight_result.data[0]["weight_lbs"] if weight_result.data else 185.0
        updates["estimated_calories_burned"] = estimate_calories(wt, dur, rpe, float(weight_lbs))

    updates["updated_at"] = now
    result = sb.table("workouts").update(updates).eq("id", workout_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/workouts/{workout_id}")
async def delete_workout(
    workout_id: str,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("workouts")
        .select("id")
        .eq("id", workout_id)
        .eq("user_id", user["user_id"])
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Workout not found")

    result = sb.table("workouts").update({"deleted_at": now}).eq("id", workout_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.post("/workouts/f3-sync")
async def f3_sync(
    request: Request,
    days: int = 7,
    user: dict = Depends(member_or_admin),
):
    """Sync F3 Nation attendance into workouts for the authenticated member."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get member's F3 name
    profile = sb.table("users").select("f3_name").eq("id", user["user_id"]).single().execute()
    f3_name = (profile.data or {}).get("f3_name")
    if not f3_name:
        raise HTTPException(status_code=400, detail="Set your F3 name in profile settings first.")

    result = await sync_member_workouts(sb, user["user_id"], f3_name, days)
    return {"data": result, "error": None, "meta": {"timestamp": now}}


@router.get("/workouts/f3-aos")
async def list_f3_aos(
    user: dict = Depends(member_or_admin),
):
    """List DSM AO locations from F3 Nation API."""
    now = datetime.now(timezone.utc).isoformat()
    aos = await get_dsm_ao_list()
    return {"data": aos, "error": None, "meta": {"timestamp": now}}
