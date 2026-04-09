"""Daily passage assignment cron job — runs 4:00 AM UTC — FS-2 §4."""

import os
from datetime import date, datetime, timezone
from supabase import create_client
from api.services.stoic import assign_daily_passage


async def run_assign_passages_job():
    """Pre-assign today's Stoic passage for all active members."""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    today = date.today()
    today_str = today.isoformat()

    # Get all active, onboarded members
    members = (
        sb.table("users")
        .select("id")
        .eq("role", "member")
        .is_("deleted_at", "null")
        .not_.is_("onboarded_at", "null")
        .execute()
    )

    assigned = 0
    for member in (members.data or []):
        user_id = member["id"]

        # Check if daily log exists and already has a passage
        existing = (
            sb.table("daily_logs")
            .select("id, stoic_passage_id")
            .eq("user_id", user_id)
            .eq("log_date", today_str)
            .limit(1)
            .execute()
        )

        if existing.data and existing.data[0].get("stoic_passage_id"):
            continue  # Already assigned

        passage_id = await assign_daily_passage(sb, user_id, today)
        if not passage_id:
            continue

        if existing.data:
            # Update existing log
            sb.table("daily_logs").update({
                "stoic_passage_id": passage_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            # Create daily log with passage
            sb.table("daily_logs").insert({
                "user_id": user_id,
                "log_date": today_str,
                "stoic_passage_id": passage_id,
            }).execute()

        assigned += 1

    print(f"Passage assignment: {assigned} members assigned")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run_assign_passages_job())
