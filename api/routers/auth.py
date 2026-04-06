"""Profile endpoints — GET/PATCH /v1/users/me."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional

from api.dependencies.auth import get_current_user

router = APIRouter(tags=["profile"])


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    timezone: Optional[str] = None
    weight_unit: Optional[str] = None
    push_token: Optional[str] = None
    onboarded_at: Optional[bool] = None  # send True to stamp onboarded_at
    f3_name: Optional[str] = None


@router.get("/users/me")
async def get_profile(request: Request, user: dict = Depends(get_current_user)):
    sb = request.app.state.supabase
    result = sb.table("users").select("*").eq("id", user["user_id"]).single().execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}}


@router.patch("/users/me")
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    sb = request.app.state.supabase
    updates = body.model_dump(exclude_none=True)

    if updates.pop("onboarded_at", None):
        updates["onboarded_at"] = datetime.now(timezone.utc).isoformat()

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = sb.table("users").update(updates).eq("id", user["user_id"]).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}}
