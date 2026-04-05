"""Daily log endpoints — FS-2 §3."""

from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role

router = APIRouter(tags=["daily-logs"])
member_or_admin = require_role(["member", "admin"])


class DailyLogUpdate(BaseModel):
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None
    mood: Optional[int] = None
    mood_note: Optional[str] = None
    weight_lbs: Optional[float] = None
    stoic_reflection: Optional[str] = None


def resolve_date(date_str: str) -> str:
    """Resolve 'today' or validate YYYY-MM-DD."""
    if date_str == "today":
        return date.today().isoformat()
    try:
        date.fromisoformat(date_str)
        return date_str
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD or 'today'.")


@router.get("/daily-logs/{log_date}")
async def get_daily_log(
    log_date: str,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    resolved = resolve_date(log_date)
    now = datetime.now(timezone.utc).isoformat()

    # Get or create
    result = (
        sb.table("daily_logs")
        .select("*")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .limit(1)
        .execute()
    )

    if result.data:
        log = result.data[0]
    else:
        # Lazy create with stoic passage assignment
        from api.services.stoic import assign_daily_passage
        passage_id = await assign_daily_passage(sb, user["user_id"], date.fromisoformat(resolved))

        insert = (
            sb.table("daily_logs")
            .insert({
                "user_id": user["user_id"],
                "log_date": resolved,
                "stoic_passage_id": passage_id,
            })
            .execute()
        )
        log = insert.data[0] if insert.data else {}

    # Linked workout count
    workouts = (
        sb.table("workouts")
        .select("id", count="exact")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .execute()
    )

    # Food log summary
    foods = (
        sb.table("food_logs")
        .select("calories")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .execute()
    )
    total_calories_in = sum(f["calories"] or 0 for f in (foods.data or []))

    log["workout_count"] = workouts.count or 0
    log["calories_in"] = total_calories_in

    return {"data": log, "error": None, "meta": {"timestamp": now}}


@router.patch("/daily-logs/{log_date}")
async def update_daily_log(
    log_date: str,
    body: DailyLogUpdate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    resolved = resolve_date(log_date)
    now = datetime.now(timezone.utc).isoformat()

    # Ensure log exists
    existing = (
        sb.table("daily_logs")
        .select("id")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Daily log not found for this date.")

    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = now

    result = (
        sb.table("daily_logs")
        .update(updates)
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .execute()
    )
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.get("/daily-logs")
async def list_daily_logs(
    request: Request,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 30,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    query = (
        sb.table("daily_logs")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("log_date", desc=True)
        .limit(limit)
    )
    if start:
        query = query.gte("log_date", start)
    if end:
        query = query.lte("log_date", end)

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}
