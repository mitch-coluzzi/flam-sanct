"""Weekly digest cron job — runs Sunday 6:00 PM member TZ — FS-5 §5."""

import os
from datetime import date, datetime, timezone
from supabase import create_client
from api.services.digest import generate_weekly_digest
from api.services.notifications import send_push_notification


async def run_weekly_digest_job():
    """Generate weekly digest for all active members."""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    today = date.today().isoformat()

    # Get all active members
    members = (
        sb.table("users")
        .select("id")
        .eq("role", "member")
        .is_("deleted_at", "null")
        .not_.is_("onboarded_at", "null")
        .execute()
    )

    generated = 0
    for member in (members.data or []):
        user_id = member["id"]

        digest_text = await generate_weekly_digest(sb, user_id)

        # Save to today's daily log
        sb.table("daily_logs").update({
            "ai_digest_text": digest_text,
            "ai_digest_generated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("log_date", today).execute()

        # Push notification
        await send_push_notification(
            sb, user_id,
            title="Your weekly digest is ready.",
            body="FlamSanct has reviewed your week.",
        )

        generated += 1

    print(f"Weekly digest: {generated} members processed")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run_weekly_digest_job())
