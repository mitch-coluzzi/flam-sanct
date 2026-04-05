"""Stoic passage selection logic — FS-2 §4."""

from datetime import date, timedelta


async def get_member_week_summary(sb, user_id: str, as_of: date) -> dict:
    """Pull last 7 days of data for tag derivation and AI frame."""
    start = (as_of - timedelta(days=7)).isoformat()
    end = as_of.isoformat()

    # Workouts
    workouts = (
        sb.table("workouts")
        .select("rpe, duration_minutes")
        .eq("user_id", user_id)
        .gte("log_date", start)
        .lte("log_date", end)
        .execute()
    )
    w_data = workouts.data or []
    workout_count = len(w_data)
    avg_rpe = round(sum(w["rpe"] for w in w_data) / workout_count, 1) if w_data else 0

    # Daily logs
    logs = (
        sb.table("daily_logs")
        .select("sleep_hours, mood, log_date")
        .eq("user_id", user_id)
        .gte("log_date", start)
        .lte("log_date", end)
        .order("log_date")
        .execute()
    )
    l_data = logs.data or []
    sleep_vals = [l["sleep_hours"] for l in l_data if l.get("sleep_hours")]
    mood_vals = [l["mood"] for l in l_data if l.get("mood")]
    avg_sleep = round(sum(sleep_vals) / len(sleep_vals), 1) if sleep_vals else 0
    avg_mood = round(sum(mood_vals) / len(mood_vals), 1) if mood_vals else 0

    # Streak: consecutive days with at least one workout, counting back from today
    streak = 0
    check = as_of
    workout_dates = {w.get("log_date") for w in (
        sb.table("workouts")
        .select("log_date")
        .eq("user_id", user_id)
        .lte("log_date", end)
        .order("log_date", desc=True)
        .limit(60)
        .execute()
    ).data or []}
    while check.isoformat() in workout_dates:
        streak += 1
        check -= timedelta(days=1)

    return {
        "workout_count": workout_count,
        "avg_rpe": avg_rpe,
        "avg_sleep_hours": avg_sleep,
        "avg_mood": avg_mood,
        "streak_days": streak,
        "phase_label": "The Grind",  # TODO: dynamic phase labels
    }


def derive_tags_from_summary(summary: dict) -> list[str]:
    """Map member data patterns to Stoic passage tags."""
    tags = []
    if summary["avg_rpe"] >= 7 and summary["avg_sleep_hours"] < 7:
        tags.extend(["endurance", "hardship"])
    elif summary["avg_sleep_hours"] >= 7 and summary["streak_days"] >= 3:
        tags.extend(["discipline", "reflection"])
    elif summary["avg_mood"] <= 2.5:
        tags.extend(["hardship", "endurance"])
    elif summary["streak_days"] >= 5:
        tags.extend(["discipline", "brotherhood"])
    else:
        tags.append("discipline")
    return tags


async def assign_daily_passage(sb, user_id: str, log_date: date) -> str | None:
    """Select a Stoic passage for the day. Returns passage_id."""
    # 1. Check admin schedule
    scheduled = (
        sb.table("stoic_schedule")
        .select("passage_id")
        .eq("scheduled_date", log_date.isoformat())
        .limit(1)
        .execute()
    )
    if scheduled.data:
        return scheduled.data[0]["passage_id"]

    # 2. Tag affinity from recent data
    summary = await get_member_week_summary(sb, user_id, log_date)
    tags = derive_tags_from_summary(summary)

    # 3. Pick passage matching tags, not used in last 90 days
    cutoff = (log_date - timedelta(days=90)).isoformat()
    recent_ids_result = (
        sb.table("daily_logs")
        .select("stoic_passage_id")
        .eq("user_id", user_id)
        .gte("log_date", cutoff)
        .not_.is_("stoic_passage_id", "null")
        .execute()
    )
    used_ids = [r["stoic_passage_id"] for r in (recent_ids_result.data or [])]

    # Query passages with overlapping tags
    query = sb.table("stoic_passages").select("id").eq("is_active", True).overlaps("tags", tags)
    if used_ids:
        query = query.not_.in_("id", used_ids)
    result = query.limit(10).execute()

    if result.data:
        import random
        return random.choice(result.data)["id"]

    # 4. Fallback: any unused passage
    fallback_query = sb.table("stoic_passages").select("id").eq("is_active", True)
    if used_ids:
        fallback_query = fallback_query.not_.in_("id", used_ids)
    fallback = fallback_query.limit(10).execute()

    if fallback.data:
        import random
        return random.choice(fallback.data)["id"]

    return None
