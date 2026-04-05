# FS-3 — Nutrition & Food Log
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1, FS-2

---

## 1. Overview

Nutrition tracking in FlamSanct has three input paths:
1. **Chef-logged** — chef enters meals they prepared for assigned members
2. **Self-logged** — member searches USDA database or enters manually
3. **Photo capture** — member snaps a photo before eating; Claude Vision estimates; chef affirms or adjusts

The calorie and macro data flows into the daily summary, which feeds the AI feedback layer.

---

## 2. API Endpoints

### Food Logs (Member)

**GET /v1/food-logs**  
List food logs for authenticated member.  
Query: `?log_date=YYYY-MM-DD` (defaults to today)  
Returns: all food log rows for the day + daily macro totals computed server-side.

**POST /v1/food-logs**  
Create a food log entry (self-logged or photo capture).  
Role: member.  
Body:
```json
{
  "log_date": "2026-04-05",
  "meal_type": "breakfast",
  "source": "self",
  "food_name": "Eggs, scrambled",
  "usda_food_id": "748967",
  "quantity": 3,
  "unit": "large",
  "calories": 234,
  "protein_g": 18.9,
  "carbs_g": 1.5,
  "fat_g": 16.8
}
```

**PATCH /v1/food-logs/{id}**  
Edit a food log entry. Member edits own entries only.

**DELETE /v1/food-logs/{id}**  
Delete a food log entry. Soft delete.

### Photo Capture

**POST /v1/food-logs/photo-capture**  
Submit a food photo for AI estimation.  
Role: member.  
Body: `multipart/form-data`
- `photo`: image file (JPEG/PNG, max 10MB)
- `meal_type`: breakfast / lunch / dinner / snack
- `log_date`: YYYY-MM-DD

Flow:
1. Upload image to Supabase Storage (`food-photos` bucket)
2. Call Claude Vision with image + portion estimation prompt
3. Create `food_logs` row with `source = 'photo_capture'`, `photo_capture_status = 'pending'`
4. Return the food log row with AI estimate
5. Notify assigned chef via Supabase Realtime channel `photo_affirm:{member_id}`

Response includes `ai_portion_estimate` (raw Claude output) and the created food log row.

**POST /v1/food-logs/{id}/affirm**  
Chef affirms or adjusts a photo capture.  
Role: chef (must be assigned to the member who owns this food log).  
Body:
```json
{
  "action": "affirm",
  "food_name": "Chicken breast with roasted vegetables",
  "calories": 520,
  "protein_g": 48.0,
  "carbs_g": 32.0,
  "fat_g": 18.0,
  "quantity": 1,
  "unit": "serving",
  "chef_note": "Adjusted calories up — larger portion than Claude estimated"
}
```
`action`: `"affirm"` (accept AI estimate as-is) or `"adjust"` (override with chef values).  
Sets `photo_capture_status`, `chef_affirmed_at`, `chef_affirmed_by`.  
Sends push notification to member on completion.

### USDA Food Search

**GET /v1/nutrition/search**  
Proxy to USDA FoodData Central API.  
Role: member.  
Query: `?q=scrambled+eggs&limit=10`  
Returns simplified food items:
```json
{
  "data": [
    {
      "fdcId": "748967",
      "description": "Eggs, scrambled",
      "brandOwner": null,
      "nutrients": {
        "calories": 78,
        "protein_g": 6.3,
        "carbs_g": 0.5,
        "fat_g": 5.6
      },
      "servingSize": 1,
      "servingUnit": "large"
    }
  ]
}
```
Cached server-side for 24 hours per query string to reduce USDA API calls.

### Chef Recipe Database

**GET /v1/chef/recipes**  
List recipes created by the authenticated chef.  
Role: chef.  
Query: `?search=chicken&tag=high-protein`

**POST /v1/chef/recipes**  
Create a new recipe.  
Role: chef.  
Body:
```json
{
  "name": "Herb Roasted Chicken Thighs",
  "description": "Bone-in thighs, rosemary, garlic",
  "serving_size": "2 thighs (~280g)",
  "calories_per_serving": 480,
  "protein_g": 42.0,
  "carbs_g": 2.0,
  "fat_g": 32.0,
  "fiber_g": 0.5,
  "tags": ["high-protein", "low-carb"]
}
```

**PATCH /v1/chef/recipes/{id}**  
Update a recipe. Chef edits own recipes only.

**DELETE /v1/chef/recipes/{id}**  
Soft delete. Sets `is_active = false`.

### Chef — Log Meal for Member

**POST /v1/chef/food-logs**  
Chef logs a meal for one or more assigned members.  
Role: chef.  
Body:
```json
{
  "member_ids": ["uuid1", "uuid2"],
  "log_date": "2026-04-05",
  "meal_type": "lunch",
  "source": "chef",
  "chef_recipe_id": "uuid",
  "quantity": 1,
  "unit": "serving"
}
```
Creates one `food_logs` row per member_id. Macros copied from recipe. Chef can override per-member if needed.

---

## 3. Claude Vision — Portion Estimation

```python
async def estimate_food_from_photo(image_url: str) -> str:
    image_data = await fetch_image_as_base64(image_url)
    
    response = await claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_data
                    }
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
Be conservative on calories if uncertain. Note if the image is unclear."""
                }
            ]
        }]
    )
    return response.content[0].text
```

The raw JSON string is stored in `food_logs.ai_portion_estimate`. The food log row is populated with parsed values. Chef affirms or adjusts.

---

## 4. Daily Macro Summary

Computed server-side on every GET /v1/food-logs response. Not stored — always calculated from current rows.

```python
def compute_daily_totals(food_logs: list) -> dict:
    return {
        "calories_in": sum(f.calories or 0 for f in food_logs),
        "protein_g": sum(f.protein_g or 0 for f in food_logs),
        "carbs_g": sum(f.carbs_g or 0 for f in food_logs),
        "fat_g": sum(f.fat_g or 0 for f in food_logs),
        "meals_logged": len(set(f.meal_type for f in food_logs)),
        "pending_affirm_count": sum(
            1 for f in food_logs
            if f.photo_capture_status == 'pending'
        )
    }
```

Calories out (from workouts) is fetched from `workouts` table for the same date and surfaced alongside:
```json
{
  "calories_in": 2140,
  "calories_out": 680,
  "net": 1460,
  "protein_g": 182.0,
  "carbs_g": 210.0,
  "fat_g": 68.0,
  "pending_affirm_count": 1
}
```

---

## 5. Expo Screens

### 5.1 Food Log Screen

Accessed from the food summary card on Home.

**Header:** Date + macro ring (calories in / out / net as a visual arc)

**Sections by meal type:**
- Breakfast / Lunch / Dinner / Snack
- Each section lists food log entries with name, quantity, calories
- "+ Add Food" button per section (opens Add Food Sheet)
- Photo camera icon per section (opens Photo Capture flow)

**Pending affirm banner:** If any photo captures are pending chef affirmation, show a banner: "1 item awaiting chef review."

### 5.2 Add Food Sheet

Bottom sheet modal. Three tabs:

**Search tab**
- Search field → calls GET /v1/nutrition/search
- Results list: food name, calories per serving, macros
- Tap to select → quantity input → confirm

**Chef Recipes tab** *(only shown if a chef recipe exists for this member)*
- List of chef's saved recipes
- Tap to select quantity

**Manual tab**
- Name, calories, protein, carbs, fat inputs
- For when the member knows the macros without searching

### 5.3 Photo Capture Flow

1. Member taps camera icon for a meal
2. Native camera opens (Expo ImagePicker)
3. Photo taken or selected from library
4. Preview screen: confirm or retake
5. Confirm → POST /v1/food-logs/photo-capture
6. Loading state: "FlamSanct is estimating your portion..."
7. Result screen: shows AI estimate with food name, calories, macros
8. Member sees: "Your chef will review and confirm this shortly."
9. Row appears in food log with "Pending" badge

When chef affirms: push notification → badge updates to "Confirmed" or "Adjusted."

---

## 6. Dietary Directives Flow

When the AI feedback layer detects a nutritional pattern (e.g., consistently low protein relative to workout volume), it generates a directive:

```python
async def generate_dietary_directive(member_id: str, summary: dict) -> str:
    prompt = f"""You are the nutrition advisor for FlamSanct.
A member's data shows:
- Average daily protein: {summary['avg_protein_g']}g
- Average workout RPE: {summary['avg_rpe']}
- Goal: {summary['goal']}

Write a brief, specific dietary directive for their chef.
Be concrete. One to three sentences. No filler."""
    ...
```

Directive is saved to `dietary_directives` table and surfaced to the Chef in their interface (FS-4). Also sent as a DM from the system to the chef's conversation with the member.
