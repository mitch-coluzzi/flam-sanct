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

        # Post to member's chef conversation so it surfaces in Inbox
        assignment = (
            sb.table("chef_assignments")
            .select("chef_id")
            .eq("member_id", user_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if assignment.data:
            chef_id = assignment.data[0]["chef_id"]
            my_parts = sb.table("conversation_participants").select("conversation_id").eq("user_id", user_id).execute()
            my_ids = [p["conversation_id"] for p in (my_parts.data or [])]
            if my_ids:
                chef_parts = sb.table("conversation_participants").select("conversation_id").eq("user_id", chef_id).in_("conversation_id", my_ids).execute()
                if chef_parts.data:
                    cid = chef_parts.data[0]["conversation_id"]
                    sb.table("messages").insert({
                        "conversation_id": cid,
                        "sender_id": user_id,
                        "body": digest_text,
                        "message_type": "ai_digest",
                        "ai_category": "weekly",
                    }).execute()

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
