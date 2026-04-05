"""Community feed endpoints — FS-7 §2."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel

from api.dependencies.auth import require_role, get_current_user

router = APIRouter(prefix="/community", tags=["community"])
member_or_admin = require_role(["member", "admin"])


class PostCreate(BaseModel):
    body: Optional[str] = None
    image_url: Optional[str] = None
    linked_workout_id: Optional[str] = None
    linked_benchmark_id: Optional[str] = None


class ReactionBody(BaseModel):
    reaction: str = "flam"


class ReplyBody(BaseModel):
    body: str


# ── Feed ──

@router.get("/feed")
async def get_feed(
    request: Request,
    limit: int = 20,
    cursor: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    query = (
        sb.table("community_posts")
        .select("*, author:users!community_posts_user_id_fkey(display_name, full_name, avatar_url)")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if cursor:
        query = query.lt("id", cursor)

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.post("/posts")
async def create_post(
    body: PostCreate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    row = body.model_dump(exclude_none=True)
    row["user_id"] = user["user_id"]

    result = sb.table("community_posts").insert(row).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify ownership or admin
    existing = sb.table("community_posts").select("user_id").eq("id", post_id).is_("deleted_at", "null").limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Post not found")
    if existing.data[0]["user_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = sb.table("community_posts").update({"deleted_at": now}).eq("id", post_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


# ── Reactions ──

@router.post("/posts/{post_id}/react")
async def toggle_reaction(
    post_id: str,
    body: ReactionBody,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Check if already reacted
    existing = (
        sb.table("community_reactions")
        .select("id")
        .eq("post_id", post_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )

    if existing.data:
        # Remove reaction
        sb.table("community_reactions").delete().eq("id", existing.data[0]["id"]).execute()
        # Decrement count
        post = sb.table("community_posts").select("reaction_count").eq("id", post_id).single().execute()
        new_count = max((post.data or {}).get("reaction_count", 1) - 1, 0)
        sb.table("community_posts").update({"reaction_count": new_count}).eq("id", post_id).execute()
        return {"data": {"action": "removed", "reaction_count": new_count}, "error": None, "meta": {"timestamp": now}}
    else:
        # Add reaction
        sb.table("community_reactions").insert({
            "post_id": post_id,
            "user_id": user["user_id"],
            "reaction": body.reaction,
        }).execute()
        # Increment count
        post = sb.table("community_posts").select("reaction_count").eq("id", post_id).single().execute()
        new_count = (post.data or {}).get("reaction_count", 0) + 1
        sb.table("community_posts").update({"reaction_count": new_count}).eq("id", post_id).execute()
        return {"data": {"action": "added", "reaction_count": new_count}, "error": None, "meta": {"timestamp": now}}


# ── Replies ──

@router.get("/posts/{post_id}/replies")
async def list_replies(
    post_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("community_replies")
        .select("*, author:users!community_replies_user_id_fkey(display_name, full_name, avatar_url)")
        .eq("post_id", post_id)
        .is_("deleted_at", "null")
        .order("created_at")
        .execute()
    )
    return {"data": result.data, "error": None, "meta": {"timestamp": now}}


@router.post("/posts/{post_id}/replies")
async def create_reply(
    post_id: str,
    body: ReplyBody,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    result = sb.table("community_replies").insert({
        "post_id": post_id,
        "user_id": user["user_id"],
        "body": body.body,
    }).execute()

    # Increment reply count
    post = sb.table("community_posts").select("reply_count").eq("id", post_id).single().execute()
    new_count = (post.data or {}).get("reply_count", 0) + 1
    sb.table("community_posts").update({"reply_count": new_count}).eq("id", post_id).execute()

    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/replies/{reply_id}")
async def delete_reply(
    reply_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = sb.table("community_replies").select("user_id, post_id").eq("id", reply_id).is_("deleted_at", "null").limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Reply not found")
    if existing.data[0]["user_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    sb.table("community_replies").update({"deleted_at": now}).eq("id", reply_id).execute()

    # Decrement reply count
    post_id = existing.data[0]["post_id"]
    post = sb.table("community_posts").select("reply_count").eq("id", post_id).single().execute()
    new_count = max((post.data or {}).get("reply_count", 1) - 1, 0)
    sb.table("community_posts").update({"reply_count": new_count}).eq("id", post_id).execute()

    return {"data": None, "error": None, "meta": {"timestamp": now}}
