"""Messages endpoints — DM conversations — FS-7 §3."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import get_current_user

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
