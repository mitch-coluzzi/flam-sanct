"""Expo push notification service — FS-2 §7."""

import os
import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    sb,
    user_id: str,
    title: str,
    body: str,
    data: dict | None = None,
):
    """Send a push notification to a user via Expo Push."""
    # Get push token
    user_result = sb.table("users").select("push_token").eq("id", user_id).single().execute()
    token = (user_result.data or {}).get("push_token")

    if not token:
        return

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
    }
    if data:
        payload["data"] = data

    async with httpx.AsyncClient() as client:
        await client.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {os.environ.get('EXPO_ACCESS_TOKEN', '')}",
            },
        )
