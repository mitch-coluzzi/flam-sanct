"""Messages endpoints — DM conversations — FS-7 §3."""

import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import get_current_user
from api.services.claude import client as claude_client, log_ai_request
from api.services.digest import build_member_context

router = APIRouter(prefix="/messages", tags=["messages"])


class ConversationCreate(BaseModel):
    participant_id: str


class MessageCreate(BaseModel):
    body: Optional[str] = None
    image_url: Optional[str] = None
    message_type: str = "text"


# ── Conversations ──

@router.get("/conversations")
async def list_conversations(
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Get conversation IDs for this user
    participations = (
        sb.table("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user["user_id"])
        .execute()
    )
    conv_ids = [p["conversation_id"] for p in (participations.data or [])]

    if not conv_ids:
        return {"data": [], "error": None, "meta": {"timestamp": now}}

    # Get conversations with participants and last message
    conversations = (
        sb.table("conversations")
        .select("*, participants:conversation_participants(user_id, user:users(display_name, full_name, avatar_url, role))")
        .in_("id", conv_ids)
        .execute()
    )

    # Enrich with last message and unread count per conversation
    result = []
    for conv in (conversations.data or []):
        # Last message
        last_msg = (
            sb.table("messages")
            .select("body, message_type, created_at, sender_id")
            .eq("conversation_id", conv["id"])
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        # Unread count
        unread = (
            sb.table("messages")
            .select("id", count="exact")
            .eq("conversation_id", conv["id"])
            .neq("sender_id", user["user_id"])
            .is_("read_at", "null")
            .is_("deleted_at", "null")
            .execute()
        )

        # Other participants
        others = [
            p for p in (conv.get("participants") or [])
            if p["user_id"] != user["user_id"]
        ]

        result.append({
            "id": conv["id"],
            "conversation_type": conv["conversation_type"],
            "label": conv.get("label"),
            "participants": others,
            "last_message": last_msg.data[0] if last_msg.data else None,
            "unread_count": unread.count or 0,
        })

    # Sort by last message time
    result.sort(key=lambda c: (c.get("last_message") or {}).get("created_at", ""), reverse=True)

    return {"data": result, "error": None, "meta": {"timestamp": now}}


@router.post("/conversations")
async def create_conversation(
    body: ConversationCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Check if DM already exists between these two users
    my_convos = (
        sb.table("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user["user_id"])
        .execute()
    )
    my_conv_ids = [p["conversation_id"] for p in (my_convos.data or [])]

    if my_conv_ids:
        their_convos = (
            sb.table("conversation_participants")
            .select("conversation_id")
            .eq("user_id", body.participant_id)
            .in_("conversation_id", my_conv_ids)
            .execute()
        )
        if their_convos.data:
            # Check if it's a DM
            existing = (
                sb.table("conversations")
                .select("*")
                .eq("id", their_convos.data[0]["conversation_id"])
                .eq("conversation_type", "dm")
                .limit(1)
                .execute()
            )
            if existing.data:
                return {"data": existing.data[0], "error": None, "meta": {"timestamp": now}}

    # Create new DM
    conv = sb.table("conversations").insert({
        "conversation_type": "dm",
        "created_by": user["user_id"],
    }).execute()

    if conv.data:
        conv_id = conv.data[0]["id"]
        sb.table("conversation_participants").insert([
            {"conversation_id": conv_id, "user_id": user["user_id"]},
            {"conversation_id": conv_id, "user_id": body.participant_id},
        ]).execute()

    return {"data": conv.data[0] if conv.data else None, "error": None, "meta": {"timestamp": now}}


# ── Messages ──

@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: str,
    request: Request,
    limit: int = 50,
    cursor: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify participant
    check = (
        sb.table("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=403, detail="Not a participant")

    query = (
        sb.table("messages")
        .select("*, sender:users!messages_sender_id_fkey(display_name, full_name, avatar_url)")
        .eq("conversation_id", conversation_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if cursor:
        query = query.lt("id", cursor)

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify participant
    check = (
        sb.table("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=403, detail="Not a participant")

    row = {
        "conversation_id": conversation_id,
        "sender_id": user["user_id"],
        "body": body.body,
        "image_url": body.image_url,
        "message_type": body.message_type,
    }

    result = sb.table("messages").insert(row).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Mark all unread messages from others as read
    sb.table("messages").update({"read_at": now}).eq(
        "conversation_id", conversation_id
    ).neq(
        "sender_id", user["user_id"]
    ).is_(
        "read_at", "null"
    ).execute()

    return {"data": {"marked_read": True}, "error": None, "meta": {"timestamp": now}}


# ── @ai summon ──

class AiSummonBody(BaseModel):
    prompt: str
    member_id: str


SUMMON_SYSTEM = """You are the AI voice of FlamSanct, joining a chef↔member conversation about nutrition and wellbeing.
Your tone is dry, honest, direct. You speak like a coach who respects both parties.
You are reading the recent thread and the member's data. You weigh in with insight, not noise.

Your response should:
1. Acknowledge what was said in the thread
2. Reference specific data points from the member context
3. Offer ONE concrete suggestion or observation
4. Be brief — 3-5 sentences max

After your response, on a new line starting with "KEY_POINTS:", provide 1-3 bullet points of the
most important takeaways as a JSON array of strings. Example:
KEY_POINTS: ["Protein 20g below target for 4 days", "Late-night snacking pattern emerging", "Recommend earlier dinner"]

Then on another new line starting with "CATEGORY:", provide one category: nutrition, recovery, training, or wellbeing.
Example: CATEGORY: nutrition"""


@router.post("/conversations/{conversation_id}/summon-ai")
async def summon_ai(
    conversation_id: str,
    body: AiSummonBody,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Triggered when @ai is mentioned in a chef↔member conversation.
    AI reads recent thread + member's nutrition/wellbeing context, weighs in,
    extracts key points, and posts as an ai_digest message.
    """
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify participant
    check = (
        sb.table("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Get recent thread (last 20 messages)
    thread = (
        sb.table("messages")
        .select("body, message_type, sender_id, created_at, sender:users!messages_sender_id_fkey(display_name, full_name, role)")
        .eq("conversation_id", conversation_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    recent = list(reversed(thread.data or []))

    thread_text = "\n".join([
        f"[{(m.get('sender') or {}).get('role', 'unknown').upper()}] {m.get('body', '')}"
        for m in recent if m.get("body")
    ])

    # Build member nutrition context
    context = await build_member_context(sb, body.member_id, days=14)
    nutrition_summary = {
        "avg_calories_in": context.get("nutrition", {}).get("avg_calories_in"),
        "avg_protein_g": context.get("nutrition", {}).get("avg_protein_g"),
        "avg_net_calories": context.get("nutrition", {}).get("avg_net_calories"),
        "weight_trend": context.get("weight_trend", {}),
        "workout_count": context.get("workouts", {}).get("total_sessions"),
        "avg_rpe": context.get("workouts", {}).get("avg_rpe"),
    }

    user_prompt = f"""Recent conversation:
{thread_text}

Member's data (last 14 days):
{json.dumps(nutrition_summary, indent=2, default=str)}

Prompt from {(user.get('role') or 'user')}: {body.prompt}

Respond with your insight, then KEY_POINTS and CATEGORY lines."""

    # Append approved prompt modifications (admin learning loop)
    mods = sb.table("prompt_modifications").select("category, modification_text").eq("approved", True).execute()
    mod_text = ""
    if mods.data:
        mod_lines = [f"- [{m['category']}] {m['modification_text']}" for m in mods.data]
        mod_text = "\n\nApproved refinements (apply when relevant):\n" + "\n".join(mod_lines)

    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=SUMMON_SYSTEM + mod_text,
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw = response.content[0].text

    # Parse out key points and category
    key_points = []
    category = "nutrition"
    main_text = raw
    if "KEY_POINTS:" in raw:
        parts = raw.split("KEY_POINTS:")
        main_text = parts[0].strip()
        rest = parts[1]
        try:
            kp_line = rest.split("\n")[0].strip()
            key_points = json.loads(kp_line)
        except Exception:
            pass
        if "CATEGORY:" in rest:
            try:
                category = rest.split("CATEGORY:")[1].strip().split("\n")[0].strip()
            except Exception:
                pass

    # Insert as ai_digest message
    inserted = sb.table("messages").insert({
        "conversation_id": conversation_id,
        "sender_id": body.member_id,  # AI messages are attributed to member's row but flagged via type
        "body": main_text,
        "message_type": "ai_digest",
        "ai_key_points": key_points or None,
        "ai_category": category,
    }).execute()

    tokens = response.usage.input_tokens + response.usage.output_tokens
    await log_ai_request(sb, user["user_id"], "on_demand", raw, tokens)

    return {
        "data": {
            "message": inserted.data[0] if inserted.data else None,
            "key_points": key_points,
            "category": category,
        },
        "error": None,
        "meta": {"timestamp": now},
    }
