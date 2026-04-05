"""USDA food search proxy — FS-3 §2."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies.auth import require_role
from api.services.nutrition import search_usda

router = APIRouter(prefix="/nutrition", tags=["nutrition"])
member_or_admin = require_role(["member", "admin"])


@router.get("/search")
async def usda_search(
    q: str,
    limit: int = 10,
    user: dict = Depends(member_or_admin),
):
    now = datetime.now(timezone.utc).isoformat()

    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    results = await search_usda(q, min(limit, 25))
    return {"data": results, "error": None, "meta": {"timestamp": now}}
