"""Weekly digest + member context builder — FS-5 §2/§5."""

import json
from datetime import date, timedelta
from api.services.claude import client as claude_client, log_ai_request


async def build_member_context(sb, user_id: str, days: int = 14) -> dict:
    """Build the standardized context package for AI calls."""
    end = date.today()
    start = end - timedelta(days=days)
    start_str, end_str = start.isoformat(), end.isoformat()

    # Member profile
    user_result = sb.table("users").select("display_name, weight_unit").eq("id", user_id).single().execute()
    profile = user_result.data or {}

    # Goals
    goals_result = sb.table("member_goals").select("description, goal_type, target_value, target_unit").eq("user_id", user_id).eq("is_active", True).execute()

    # Latest weight
    weight_result = sb.table("daily_logs").select("weight_lbs, log_date").eq("user_id", user_id).not_.is_("weight_lbs", "null").order("log_date", desc=True).limit(days).execute()
    weights = weight_result.data or []
    current_weight = weights[0]["weight_lbs"] if weights else None
    start_weight = weights[-1]["weight_lbs"] if weights else None
    if current_weight and start_weight:
        delta = round(current_weight - start_weight, 1)
        trend = "declining" if delta < -0.5 else "increasing" if delta > 0.5 else "flat"
    else:
        delta, trend = 0, "unknown"

    # Workouts
    workouts_result = sb.table("workouts").select("log_date, workout_type, duration_minutes, rpe, estimated_calories_burned").eq("user_id", user_id).gte("log_date", start_str).lte("log_date", end_str).order("log_date").execute()
    w_data = workouts_result.data or []
    workout_dates = {w["log_date"] for w in w_data}
    all_dates = {(start + timedelta(days=i)).isoformat() for i in range(days + 1)}
    rest_days = len(all_dates - workout_dates)
    avg_rpe = round(sum(w["rpe"] for w in w_data) / len(w_data), 1) if w_data else 0

    # Streak
    streak = 0
    check = end
    while check.isoformat() in workout_dates:
        streak += 1
        check -= timedelta(days=1)

    # Food logs
    foods_result = sb.table("food_logs").select("calories, protein_g, carbs_g, fat_g, log_date").eq("user_id", user_id).gte("log_date", start_str).lte("log_date", end_str).execute()
    f_data = foods_result.data or []
    food_days = len({f["log_date"] for f in f_data}) or 1
    avg_cal = round(sum(f.get("calories") or 0 for f in f_data) / food_days)
    avg_protein = round(sum(f.get("protein_g") or 0 for f in f_data) / food_days, 1)
    avg_carbs = round(sum(f.get("carbs_g") or 0 for f in f_data) / food_days, 1)
    avg_fat = round(sum(f.get("fat_g") or 0 for f in f_data) / food_days, 1)

    # Calories out
    total_cal_out = sum(w.get("estimated_calories_burned") or 0 for w in w_data)
    workout_days = len(workout_dates) or 1
    avg_cal_out = round(total_cal_out / workout_days)
    avg_net = avg_cal - avg_cal_out

    # Recovery
    logs_result = sb.table("daily_logs").select("sleep_hours, sleep_quality, mood").eq("user_id", user_id).gte("log_date", start_str).lte("log_date", end_str).execute()
    l_data = logs_result.data or []
    sleep_vals = [l["sleep_hours"] for l in l_data if l.get("sleep_hours")]
    quality_vals = [l["sleep_quality"] for l in l_data if l.get("sleep_quality")]
    mood_vals = [l["mood"] for l in l_data if l.get("mood")]

    # Benchmark PRs
    prs = sb.table("benchmark_results").select("*, benchmark:benchmarks(name)").eq("user_id", user_id).eq("is_pr", True).gte("log_date", start_str).execute()

    return {
        "member": {
            "display_name": profile.get("display_name", ""),
            "current_weight_lbs": current_weight,
            "goals": [g["description"] for g in (goals_result.data or [])],
            "phase_label": "The Grind",
            "streak_days": streak,
        },
        "workouts": {
            "last_n_days": w_data,
            "avg_rpe": avg_rpe,
            "total_sessions": len(w_data),
            "rest_days": rest_days,
        },
        "nutrition": {
            "avg_calories_in": avg_cal,
            "avg_protein_g": avg_protein,
            "avg_carbs_g": avg_carbs,
            "avg_fat_g": avg_fat,
            "avg_net_calories": avg_net,
        },
        "recovery": {
            "avg_sleep_hours": round(sum(sleep_vals) / len(sleep_vals), 1) if sleep_vals else 0,
            "avg_sleep_quality": round(sum(quality_vals) / len(quality_vals), 1) if quality_vals else 0,
            "avg_mood": round(sum(mood_vals) / len(mood_vals), 1) if mood_vals else 0,
        },
        "weight_trend": {
            "start": start_weight,
            "current": current_weight,
            "delta": delta,
            "trend": trend,
        },
        "benchmarks": prs.data or [],
    }


async def generate_weekly_digest(sb, user_id: str) -> str:
    """Generate Sunday weekly digest."""
    context = await build_member_context(sb, user_id, days=7)

    system_prompt = """You are the AI voice of FlamSanct writing a member's weekly digest.
Tone: dry, honest, brief. Like a good coach, not a cheerleader.
Structure:
1. What the data shows (2-3 sentences, specific numbers)
2. What's working (1-2 sentences)
3. What to watch (1-2 sentences)
4. One specific recommendation for next week (1 sentence)
No headers. No bullet points. Prose only. Under 200 words."""

    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=system_prompt,
        messages=[{"role": "user", "content": json.dumps(context, default=str)}],
    )

    digest_text = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens
    await log_ai_request(sb, user_id, "weekly_digest", digest_text, tokens)

    return digest_text
