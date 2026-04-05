"""USDA FoodData Central proxy + daily macro computation — FS-3."""

import os
import time
import httpx

USDA_BASE = "https://api.nal.usda.gov/fdc/v1"
USDA_API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")

# Simple in-memory cache: {query_string: (timestamp, data)}
_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL = 86400  # 24 hours


async def search_usda(query: str, limit: int = 10) -> list[dict]:
    """Search USDA FoodData Central. Results cached 24h per query."""
    cache_key = f"{query}:{limit}"
    if cache_key in _cache:
        ts, data = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return data

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{USDA_BASE}/foods/search",
            params={
                "api_key": USDA_API_KEY,
                "query": query,
                "pageSize": limit,
                "dataType": ["Foundation", "SR Legacy"],
            },
        )
        resp.raise_for_status()

    raw = resp.json().get("foods", [])
    results = []
    for food in raw:
        nutrients = {n["nutrientName"]: n["value"] for n in food.get("foodNutrients", [])}
        results.append({
            "fdcId": str(food.get("fdcId", "")),
            "description": food.get("description", ""),
            "brandOwner": food.get("brandOwner"),
            "nutrients": {
                "calories": nutrients.get("Energy", 0),
                "protein_g": nutrients.get("Protein", 0),
                "carbs_g": nutrients.get("Carbohydrate, by difference", 0),
                "fat_g": nutrients.get("Total lipid (fat)", 0),
            },
            "servingSize": food.get("servingSize", 1),
            "servingUnit": food.get("servingSizeUnit", "g"),
        })

    _cache[cache_key] = (time.time(), results)
    return results


def compute_daily_totals(food_logs: list[dict]) -> dict:
    """Compute macro totals from a list of food log rows."""
    return {
        "calories_in": sum(f.get("calories") or 0 for f in food_logs),
        "protein_g": round(sum(f.get("protein_g") or 0 for f in food_logs), 1),
        "carbs_g": round(sum(f.get("carbs_g") or 0 for f in food_logs), 1),
        "fat_g": round(sum(f.get("fat_g") or 0 for f in food_logs), 1),
        "meals_logged": len({f.get("meal_type") for f in food_logs}),
        "pending_affirm_count": sum(
            1 for f in food_logs if f.get("photo_capture_status") == "pending"
        ),
    }
