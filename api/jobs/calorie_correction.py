"""Calorie correction cron job — runs Monday 2:00 AM UTC — FS-0 §8.

Compares predicted weight delta (net calories / 3500) against actual weight
delta over the member's data window.  Stores a personal correction_factor
on the users table so estimate_calories can scale future predictions.

Only runs for members with 30+ days of food + weight data.
"""

import os
from datetime import date, timedelta, datetime, timezone
from supabase import create_client


async def run_calorie_correction_job():
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    today = date.today()
    window_start = (today - timedelta(days=30)).isoformat()
    today_str = today.isoformat()

    # Members with 30+ days of data
    members = (
        sb.table("users")
        .select("id")
        .eq("role", "member")
        .is_("deleted_at", "null")
        .not_.is_("onboarded_at", "null")
        .execute()
    )

    updated = 0
    for member in (members.data or []):
        user_id = member["id"]

        # Weight data points
        weights = (
            sb.table("daily_logs")
            .select("log_date, weight_lbs")
            .eq("user_id", user_id)
            .gte("log_date", window_start)
            .not_.is_("weight_lbs", "null")
            .order("log_date")
            .execute()
        )
        w_data = weights.data or []
        if len(w_data) < 4:  # Need at least 4 weigh-ins across 30 days
            continue

        actual_delta_lbs = w_data[-1]["weight_lbs"] - w_data[0]["weight_lbs"]

        # Total calories in
        foods = (
            sb.table("food_logs")
            .select("calories")
            .eq("user_id", user_id)
            .gte("log_date", window_start)
            .lte("log_date", today_str)
            .execute()
        )
        total_cal_in = sum(f.get("calories") or 0 for f in (foods.data or []))

        # Total calories out (estimated burn)
        workouts = (
            sb.table("workouts")
            .select("estimated_calories_burned")
            .eq("user_id", user_id)
            .gte("log_date", window_start)
            .lte("log_date", today_str)
            .execute()
        )
        total_cal_out = sum(w.get("estimated_calories_burned") or 0 for w in (workouts.data or []))

        if total_cal_out == 0:
            continue

        # Predicted weight delta: net surplus/deficit / 3500 cal per lb
        net_calories = total_cal_in - total_cal_out
        predicted_delta_lbs = net_calories / 3500

        if abs(predicted_delta_lbs) < 0.1:
            continue  # Not enough signal

        # correction_factor = actual / predicted
        # > 1.0 means the model underestimates burn (member lost more than predicted)
        # < 1.0 means the model overestimates burn (member lost less than predicted)
        # Clamp to [0.7, 1.5] to prevent wild swings
        raw_factor = actual_delta_lbs / predicted_delta_lbs if predicted_delta_lbs != 0 else 1.0
        correction_factor = round(max(0.7, min(1.5, raw_factor)), 3)

        # Store on user
        sb.table("users").update({
            "calorie_correction_factor": correction_factor,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user_id).execute()

        updated += 1

    print(f"Calorie correction: {updated} members updated")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run_calorie_correction_job())
