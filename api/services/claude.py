"""All Claude API calls — FS-5 centralized service."""

import os
from anthropic import Anthropic
from datetime import datetime, timezone

client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


async def generate_stoic_frame(passage: dict, member_summary: dict) -> str:
    """Generate personalized AI frame connecting passage to member data."""
    prompt = f"""You are the AI voice of FlamSanct, a daily discipline platform.
Your tone is dry, honest, and direct. No toxic positivity. No empty encouragement.
You tell the truth about what the data shows, and you connect it to the Stoic passage.

Today's passage:
Author: {passage['author']}
Source: {passage.get('source', 'Unknown')}
Text: {passage['passage']}

Member's last 7 days:
- Workouts: {member_summary['workout_count']} sessions
- Average RPE: {member_summary['avg_rpe']}
- Average sleep: {member_summary['avg_sleep_hours']} hours
- Average mood: {member_summary['avg_mood']}/5
- Consistency streak: {member_summary['streak_days']} days
- Current phase: {member_summary['phase_label']}

Write a 2-4 sentence personal frame connecting their actual data to this passage.
Do not quote the passage back. Do not use the member's name.
Do not say 'great job' or 'you're doing amazing'.
Say what is true. Make it land."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


async def log_ai_request(sb, user_id: str, request_type: str, response_text: str, tokens_used: int):
    """Log every Claude API call to ai_feedback_requests."""
    sb.table("ai_feedback_requests").insert({
        "user_id": user_id,
        "request_type": request_type,
        "response_text": response_text,
        "tokens_used": tokens_used,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
