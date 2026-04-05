"""AI feedback endpoints — FS-5 §3."""

import json
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role
from api.services.digest import build_member_context
from api.services.claude import client as claude_client, log_ai_request

router = APIRouter(prefix="/ai", tags=["ai"])
member_or_admin = require_role(["member", "admin"])

DAILY_QUERY_LIMIT = 10

SYSTEM_PROMPT = """You are the AI voice of FlamSanct.
Your tone is dry, honest, and direct. You speak to someone who chose the hard thing today.
You do not give empty encouragement. You give honest feedback grounded in the data.
You are brief. Answer the question. Do not pad."""


class QueryBody(BaseModel):
    question: str


@router.post("/query")
async def on_demand_query(
    body: QueryBody,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()
    today = date.today().isoformat()

    # Rate limit: 10 per day
    count_result = (
        sb.table("ai_feedback_requests")
        .select("id", count="exact")
        .eq("user_id", user["user_id"])
        .eq("request_type", "on_demand")
        .gte("created_at", f"{today}T00:00:00")
        .execute()
    )
    used = count_result.count or 0
    if used >= DAILY_QUERY_LIMIT:
        raise HTTPException(status_code=429, detail="Daily query limit reached (10/day)")

    # Build context and query Claude
    context = await build_member_context(sb, user["user_id"], days=14)

    user_prompt = f"""Member data (last 14 days):
{json.dumps(context, indent=2, default=str)}

Member's question: {body.question}

Answer honestly based on the data. Be specific. Be brief."""

    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    answer = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens

    await log_ai_request(sb, user["user_id"], "on_demand", answer, tokens)

    return {
        "data": {
            "answer": answer,
            "queries_remaining": DAILY_QUERY_LIMIT - used - 1,
        },
        "error": None,
        "meta": {"timestamp": now},
    }


@router.get("/history")
async def query_history(
    request: Request,
    limit: int = 5,
    user: dict = Depends(member_or_admin),
):
    """Recent on-demand queries for the member."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("ai_feedback_requests")
        .select("response_text, created_at, request_type")
        .eq("user_id", user["user_id"])
        .eq("request_type", "on_demand")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return {"data": result.data, "error": None, "meta": {"timestamp": now}}
