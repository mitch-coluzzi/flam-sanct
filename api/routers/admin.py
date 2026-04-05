"""Admin endpoints — user management and chef assignments."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from typing import Optional

from api.dependencies.auth import require_role

router = APIRouter(prefix="/admin", tags=["admin"])

admin_only = require_role(["admin"])


class RoleUpdate(BaseModel):
    role: str


class ChefAssignment(BaseModel):
    chef_id: str
    member_id: str


# ── Users ──

@router.get("/users")
async def list_users(
    request: Request,
    role: Optional[str] = None,
    limit: int = 20,
    cursor: Optional[str] = None,
    user: dict = Depends(admin_only),
):
    sb = request.app.state.supabase
    query = sb.table("users").select("*, chef_assignments!chef_assignments_member_id_fkey(chef_id, active)").is_("deleted_at", "null").order("created_at").limit(limit)

    if role:
        query = query.eq("role", role)
    if cursor:
        query = query.gt("id", cursor)

    result = query.execute()
    return {"data": result.data, "error": None, "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    request: Request,
    user: dict = Depends(admin_only),
):
    if body.role not in ("member", "chef", "admin", "dietician"):
        raise HTTPException(status_code=400, detail="Invalid role")

    sb = request.app.state.supabase
    result = (
        sb.table("users")
        .update({"role": body.role, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"data": result.data[0], "error": None, "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}}


# ── Chef Assignments ──

@router.get("/chef-assignments")
async def list_chef_assignments(
    request: Request,
    user: dict = Depends(admin_only),
):
    sb = request.app.state.supabase
    result = (
        sb.table("chef_assignments")
        .select("*, chef:users!chef_assignments_chef_id_fkey(full_name, email), member:users!chef_assignments_member_id_fkey(full_name, email)")
        .eq("active", True)
        .execute()
    )
    return {"data": result.data, "error": None, "meta": {"timestamp": datetime.now(timezone.utc).isoformat()}}


@router.post("/chef-assignments")
async def create_chef_assignment(
    body: ChefAssignment,
    request: Request,
    user: dict = Depends(admin_only),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Deactivate existing active assignment for this member
    sb.table("chef_assignments").update(
        {"active": False, "ended_at": now}
    ).eq("member_id", body.member_id).eq("active", True).execute()

    # Create new assignment
    result = (
        sb.table("chef_assignments")
        .insert({
            "chef_id": body.chef_id,
            "member_id": body.member_id,
            "active": True,
            "started_at": now,
        })
        .execute()
    )
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/chef-assignments/{assignment_id}")
async def deactivate_chef_assignment(
    assignment_id: str,
    request: Request,
    user: dict = Depends(admin_only),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("chef_assignments")
        .update({"active": False, "ended_at": now})
        .eq("id", assignment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"data": result.data[0], "error": None, "meta": {"timestamp": now}}
