"""Food log endpoints — FS-3 §2."""

import json
import base64
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from api.dependencies.auth import require_role
from api.services.nutrition import compute_daily_totals
from api.services.claude import client as claude_client, log_ai_request

router = APIRouter(tags=["food-logs"])
member_or_admin = require_role(["member", "admin"])


class FoodLogCreate(BaseModel):
    log_date: str
    meal_type: str
    source: str = "self"
    food_name: str
    usda_food_id: Optional[str] = None
    chef_recipe_id: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None


class FoodLogUpdate(BaseModel):
    food_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None


class AffirmBody(BaseModel):
    action: str  # "affirm" or "adjust"
    food_name: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    chef_note: Optional[str] = None


@router.get("/food-logs")
async def list_food_logs(
    request: Request,
    log_date: Optional[str] = None,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()
    resolved = log_date or date.today().isoformat()

    foods = (
        sb.table("food_logs")
        .select("*")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .order("created_at")
        .execute()
    )

    totals = compute_daily_totals(foods.data or [])

    # Calories out from workouts
    workouts = (
        sb.table("workouts")
        .select("estimated_calories_burned")
        .eq("user_id", user["user_id"])
        .eq("log_date", resolved)
        .execute()
    )
    calories_out = sum(w.get("estimated_calories_burned") or 0 for w in (workouts.data or []))
    totals["calories_out"] = calories_out
    totals["net"] = totals["calories_in"] - calories_out

    return {"data": {"items": foods.data, "totals": totals}, "error": None, "meta": {"timestamp": now}}


@router.post("/food-logs")
async def create_food_log(
    body: FoodLogCreate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    row = body.model_dump(exclude_none=True)
    row["user_id"] = user["user_id"]

    result = sb.table("food_logs").insert(row).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.patch("/food-logs/{food_log_id}")
async def update_food_log(
    food_log_id: str,
    body: FoodLogUpdate,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("food_logs")
        .select("id")
        .eq("id", food_log_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Food log not found")

    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = now
    result = sb.table("food_logs").update(updates).eq("id", food_log_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.delete("/food-logs/{food_log_id}")
async def delete_food_log(
    food_log_id: str,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("food_logs")
        .select("id")
        .eq("id", food_log_id)
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Food log not found")

    # Soft delete — food_logs doesn't have deleted_at in schema, so we just delete
    sb.table("food_logs").delete().eq("id", food_log_id).execute()
    return {"data": None, "error": None, "meta": {"timestamp": now}}


@router.post("/food-logs/photo-capture")
async def photo_capture(
    request: Request,
    photo: UploadFile = File(...),
    meal_type: str = Form(...),
    log_date: str = Form(...),
    user: dict = Depends(member_or_admin),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # 1. Upload to Supabase Storage
    file_bytes = await photo.read()
    ext = photo.filename.split(".")[-1] if photo.filename else "jpg"
    storage_path = f"{user['user_id']}/{log_date}_{meal_type}_{int(datetime.now().timestamp())}.{ext}"

    sb.storage.from_("food-photos").upload(
        storage_path,
        file_bytes,
        file_options={"content-type": photo.content_type or "image/jpeg"},
    )
    photo_url = f"{sb.supabase_url}/storage/v1/object/food-photos/{storage_path}"

    # 2. Claude Vision estimation
    b64_data = base64.b64encode(file_bytes).decode("utf-8")
    media_type = photo.content_type or "image/jpeg"

    vision_response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": b64_data},
                },
                {
                    "type": "text",
                    "text": """Analyze this food photo and provide a portion estimate.
Respond in this exact JSON format:
{
  "food_name": "descriptive name of the food",
  "estimated_quantity": numeric value,
  "unit": "oz/g/cup/serving/piece",
  "calories_estimate": integer,
  "protein_g": numeric,
  "carbs_g": numeric,
  "fat_g": numeric,
  "confidence": "low/medium/high",
  "notes": "any relevant observations about portion size or ingredients"
}
Be conservative on calories if uncertain. Note if the image is unclear.""",
                },
            ],
        }],
    )
    ai_raw = vision_response.content[0].text

    # 3. Parse AI estimate
    try:
        estimate = json.loads(ai_raw)
    except json.JSONDecodeError:
        estimate = {"food_name": "Unknown food", "calories_estimate": 0}

    # 4. Create food log row
    row = {
        "user_id": user["user_id"],
        "log_date": log_date,
        "meal_type": meal_type,
        "source": "photo_capture",
        "food_name": estimate.get("food_name", "Photo capture"),
        "quantity": estimate.get("estimated_quantity"),
        "unit": estimate.get("unit"),
        "calories": estimate.get("calories_estimate"),
        "protein_g": estimate.get("protein_g"),
        "carbs_g": estimate.get("carbs_g"),
        "fat_g": estimate.get("fat_g"),
        "photo_url": photo_url,
        "photo_capture_status": "pending",
        "ai_portion_estimate": ai_raw,
    }
    result = sb.table("food_logs").insert(row).execute()

    # 5. Log AI call
    tokens = vision_response.usage.input_tokens + vision_response.usage.output_tokens
    await log_ai_request(sb, user["user_id"], "on_demand", ai_raw, tokens)

    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}


@router.post("/food-logs/{food_log_id}/estimate")
async def estimate_existing_photo(
    food_log_id: str,
    request: Request,
    user: dict = Depends(member_or_admin),
):
    """Run Claude Vision on an already-uploaded photo and store the estimate."""
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify ownership and get photo URL
    existing = sb.table("food_logs").select("*").eq("id", food_log_id).eq("user_id", user["user_id"]).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Food log not found")
    food_log = existing.data[0]
    photo_url = food_log.get("photo_url")
    if not photo_url:
        raise HTTPException(status_code=400, detail="No photo URL on this food log")

    # Download the image
    import httpx
    async with httpx.AsyncClient() as client:
        img_resp = await client.get(photo_url, timeout=15)
        img_bytes = img_resp.content

    b64_data = base64.b64encode(img_bytes).decode("utf-8")
    media_type = "image/jpeg"

    # Build prompt with member narrative if provided
    narrative = food_log.get("narrative")
    narrative_hint = f"\n\nMember's description: {narrative}" if narrative else ""

    vision_response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_data}},
                {
                    "type": "text",
                    "text": f"""Analyze this food photo and provide a portion estimate.{narrative_hint}
Respond in this exact JSON format:
{{
  "food_name": "descriptive name",
  "estimated_quantity": numeric,
  "unit": "oz/g/cup/serving/piece",
  "calories_estimate": integer,
  "protein_g": numeric,
  "carbs_g": numeric,
  "fat_g": numeric,
  "confidence": "low/medium/high",
  "notes": "observations"
}}
Be conservative on calories if uncertain."""
                },
            ],
        }],
    )
    ai_raw = vision_response.content[0].text

    try:
        estimate = json.loads(ai_raw)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code blocks
        import re
        match = re.search(r'\{.*\}', ai_raw, re.DOTALL)
        estimate = json.loads(match.group()) if match else {"food_name": food_log.get("food_name") or "Unknown"}

    # Update food log with estimate (keeps status pending for chef review)
    updates = {
        "food_name": estimate.get("food_name") or food_log.get("food_name"),
        "quantity": estimate.get("estimated_quantity"),
        "unit": estimate.get("unit"),
        "calories": estimate.get("calories_estimate"),
        "protein_g": estimate.get("protein_g"),
        "carbs_g": estimate.get("carbs_g"),
        "fat_g": estimate.get("fat_g"),
        "ai_portion_estimate": ai_raw,
        "updated_at": now,
    }
    sb.table("food_logs").update(updates).eq("id", food_log_id).execute()

    tokens = vision_response.usage.input_tokens + vision_response.usage.output_tokens
    await log_ai_request(sb, user["user_id"], "on_demand", ai_raw, tokens)

    return {"data": {"estimate": estimate, "raw": ai_raw}, "error": None, "meta": {"timestamp": now}}


@router.post("/food-logs/{food_log_id}/affirm")
async def affirm_photo_capture(
    food_log_id: str,
    body: AffirmBody,
    request: Request,
    user: dict = Depends(require_role(["chef", "admin"])),
):
    sb = request.app.state.supabase
    now = datetime.now(timezone.utc).isoformat()

    # Verify food log exists and is pending
    existing = (
        sb.table("food_logs")
        .select("*, user_id")
        .eq("id", food_log_id)
        .eq("photo_capture_status", "pending")
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Pending food log not found")

    food_log = existing.data[0]

    # Verify chef is assigned to this member
    if user["role"] == "chef":
        assignment = (
            sb.table("chef_assignments")
            .select("id")
            .eq("chef_id", user["user_id"])
            .eq("member_id", food_log["user_id"])
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if not assignment.data:
            raise HTTPException(status_code=403, detail="Not assigned to this member")

    updates = {
        "photo_capture_status": "affirmed" if body.action == "affirm" else "adjusted",
        "chef_affirmed_at": now,
        "chef_affirmed_by": user["user_id"],
        "updated_at": now,
    }

    # If adjusting, override values
    if body.action == "adjust":
        for field in ("food_name", "calories", "protein_g", "carbs_g", "fat_g", "quantity", "unit"):
            val = getattr(body, field, None)
            if val is not None:
                updates[field] = val

    result = sb.table("food_logs").update(updates).eq("id", food_log_id).execute()
    return {"data": result.data[0] if result.data else None, "error": None, "meta": {"timestamp": now}}
