"""Stoic passage endpoints — FS-2 §3."""

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role
from api.services.stoic import assign_daily_passage, get_member_week_summary
from api.services.claude import generate_stoic_frame, log_ai_request

router = APIRouter(prefix="/stoic", tags=["stoic"])
member_or_admin = require_role(["member", "admin"])


class ReflectionBody(BaseModel):
    reflection: str


@router.get("/today")
async def get_stoic_today(
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    today = date.today().isoformat()
    now = datetime.now(timezone.utc).isoformat()

    # Get or create today's daily log
    log_result = (
        sb.table("daily_logs")
        .select("id, stoic_passage_id, stoic_reflection, ai_digest_text")
        .eq("user_id", user["user_id"])
        .eq("log_date", today)
        .limit(1)
        .execute()
    )

    if log_result.data:
        log = log_result.data[0]
    else:
        passage_id = await assign_daily_passage(sb, user["user_id"], date.today())
        insert = (
            sb.table("daily_logs")
            .insert({
                "user_id": user["user_id"],
                "log_date": today,
                "stoic_passage_id": passage_id,
            })
            .execute()
        )
        log = insert.data[0] if insert.data else {}

    # Fetch the passage
    passage = None
    if log.get("stoic_passage_id"):
        p_result = (
            sb.table("stoic_passages")
            .select("id, author, source, passage")
            .eq("id", log["stoic_passage_id"])
            .single()
            .execute()
        )
        passage = p_result.data

    # Generate AI frame if not cached
    ai_frame = log.get("ai_digest_text")
    if not ai_frame and passage:
        summary = await get_member_week_summary(sb, user["user_id"], date.today())
        ai_frame = await generate_stoic_frame(passage, summary)

        # Cache on daily log
        sb.table("daily_logs").update({
            "ai_digest_text": ai_frame,
            "ai_digest_generated_at": now,
        }).eq("id", log["id"]).execute()

        # Log AI call
        await log_ai_request(sb, user["user_id"], "on_demand", ai_frame, 300)

    return {
        "data": {
            "passage": passage,
            "ai_frame": ai_frame,
            "reflection_saved": bool(log.get("stoic_reflection")),
        },
        "error": None,
        "meta": {"timestamp": now},
    }


@router.post("/reflection")
async def save_reflection(
    body: ReflectionBody,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    today = date.today().isoformat()
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("daily_logs")
        .select("id")
        .eq("user_id", user["user_id"])
        .eq("log_date", today)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="No daily log for today. Open the app first.")

    result = (
        sb.table("daily_logs")
        .update({"stoic_reflection": body.reflection, "updated_at": now})
        .eq("user_id", user["user_id"])
        .eq("log_date", today)
        .execute()
    )
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}
