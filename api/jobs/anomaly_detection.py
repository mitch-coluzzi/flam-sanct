"""Anomaly detection cron job — runs daily 10:00 AM UTC — FS-5 §4."""

import os
import json
from datetime import date, datetime, timezone
from supabase import create_client
from api.services.digest import build_member_context
from api.services.anomaly import detect_anomalies
from api.services.claude import client as claude_client, log_ai_request
from api.services.notifications import send_push_notification


async def generate_anomaly_alert(anomalies: list[dict], context: dict) -> str:
    """Generate a brief, data-grounded anomaly alert via Claude."""
    prompt = f"""You are the AI voice of FlamSanct.
Tone: matter-of-fact. No panic. No coddling. Just data and implication.

Anomalies detected:
{json.dumps(anomalies, indent=2)}

Member context:
{json.dumps(context, indent=2, default=str)}

Write a 2-4 sentence alert. State what the data shows and what it implies.
Do not say 'great job'. Do not say 'you should be proud'. Say what is true."""

    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


async def run_anomaly_detection_job():
    """Check all active members for anomalies."""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    today = date.today().isoformat()

    # Get members who have a daily log for today (checked in)
    logs = (
        sb.table("daily_logs")
        .select("user_id")
        .eq("log_date", today)
        .execute()
    )

    checked = 0
    flagged = 0
    for log in (logs.data or []):
        user_id = log["user_id"]
        context = await build_member_context(sb, user_id, days=7)
        anomalies = detect_anomalies(context)

        if not anomalies:
            checked += 1
            continue

        # Generate alert
        alert_text = await generate_anomaly_alert(anomalies, context)

        # Flag daily log
        sb.table("daily_logs").update({
            "anomaly_flagged": True,
            "anomaly_note": alert_text,
        }).eq("user_id", user_id).eq("log_date", today).execute()

        # Log AI call
        tokens = 300  # approximate
        await log_ai_request(sb, user_id, "anomaly", alert_text, tokens)

        # Push notification
        await send_push_notification(
            sb, user_id,
            title="FlamSanct Notice",
            body=anomalies[0]["short_message"],
        )

        # Auto-post to chef↔member conversation if food/health-related anomaly
        food_related_types = {"nutrition_alert", "protein_alert", "plateau_alert", "overtraining_alert"}
        is_food_related = any(a.get("type") in food_related_types for a in anomalies)
        if is_food_related:
            # Find chef assignment
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
                # Find DM conversation
                my_parts = sb.table("conversation_participants").select("conversation_id").eq("user_id", user_id).execute()
                my_ids = [p["conversation_id"] for p in (my_parts.data or [])]
                if my_ids:
                    chef_parts = sb.table("conversation_participants").select("conversation_id").eq("user_id", chef_id).in_("conversation_id", my_ids).execute()
                    if chef_parts.data:
                        cid = chef_parts.data[0]["conversation_id"]
                        # Build key points from anomaly types
                        key_points = [a["short_message"] for a in anomalies if a.get("type") in food_related_types][:3]
                        category = "nutrition" if any(a.get("type") in {"nutrition_alert", "protein_alert", "plateau_alert"} for a in anomalies) else "training"
                        sb.table("messages").insert({
                            "conversation_id": cid,
                            "sender_id": user_id,
                            "body": alert_text,
                            "message_type": "ai_digest",
                            "ai_key_points": key_points,
                            "ai_category": category,
                        }).execute()

        checked += 1
        flagged += 1

    print(f"Anomaly detection: {checked} members checked, {flagged} flagged")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(run_anomaly_detection_job())
