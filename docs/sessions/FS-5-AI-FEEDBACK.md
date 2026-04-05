# FS-5 — AI Feedback Layer
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1, FS-2, FS-3

---

## 1. Overview

The AI feedback layer has three modes:
1. **On-demand** — member asks a question, Claude answers with full context
2. **Anomaly detection** — system detects warning patterns and alerts member
3. **Weekly digest** — Sunday evening summary and recommendations

All Claude calls use `claude-sonnet-4-6`. All prompts share a system voice: dry, honest, data-grounded, FlamSanct-native. No toxic positivity. No empty affirmations.

---

## 2. Member Context Package

Every AI call receives a standardized context package built from the member's data:

```python
async def build_member_context(user_id: str, days: int = 14) -> dict:
    return {
        "member": {
            "display_name": ...,
            "current_weight_lbs": ...,
            "goals": [...],
            "phase_label": "The Grind",
            "streak_days": ...,
        },
        "workouts": {
            "last_n_days": [
                {
                    "date": "2026-04-05",
                    "type": "f3",
                    "duration_minutes": 45,
                    "rpe": 8,
                    "estimated_calories_burned": 620
                },
                ...
            ],
            "avg_rpe": 7.4,
            "total_sessions": 11,
            "rest_days": 3,
        },
        "nutrition": {
            "avg_calories_in": 2180,
            "avg_protein_g": 148,
            "avg_carbs_g": 220,
            "avg_fat_g": 72,
            "avg_net_calories": 1420,
        },
        "recovery": {
            "avg_sleep_hours": 6.8,
            "avg_sleep_quality": 3.2,
            "avg_mood": 3.4,
        },
        "weight_trend": {
            "start": 222.0,
            "current": 219.5,
            "delta": -2.5,
            "trend": "declining"
        },
        "benchmarks": [...recent PRs and results...],
    }
```

---

## 3. On-Demand Query

**POST /v1/ai/query**  
Member submits a free-text question. Claude responds with full context loaded.  
Role: member.  
Body: `{ "question": "Am I eating enough protein for my workout load?" }`  
Rate limit: 10 requests per member per day.

```python
async def handle_on_demand_query(user_id: str, question: str) -> str:
    context = await build_member_context(user_id, days=14)
    
    system_prompt = """You are the AI voice of FlamSanct.
Your tone is dry, honest, and direct. You speak to someone who chose the hard thing today.
You do not give empty encouragement. You give honest feedback grounded in the data.
You are brief. Answer the question. Do not pad."""

    user_prompt = f"""Member data (last 14 days):
{json.dumps(context, indent=2)}

Member's question: {question}

Answer honestly based on the data. Be specific. Be brief."""

    response = await claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )
    
    # Log to ai_feedback_requests
    await log_ai_request(user_id, "on_demand", context, response)
    
    return response.content[0].text
```

**Expo — "Ask FlamSanct" Screen**  
- Text input field: "Ask about your data..."
- Recent questions list (last 5 on-demand queries with responses)
- Response displayed inline, formatted as plain text
- "10 questions remaining today" counter

---

## 4. Anomaly Detection

Runs daily at 10:00 AM UTC as a scheduled job. Checks all members who completed a morning check-in.

**Anomaly conditions (any one triggers):**

| Condition | Threshold | Alert |
|---|---|---|
| Sleep declining | Avg < 6 hours for 3+ consecutive days | Sleep alert |
| Mood declining | Avg ≤ 2 for 3+ consecutive days | Mood alert |
| High RPE streak | 5+ sessions RPE ≥ 8 with no rest day | Overtraining alert |
| Calorie deficit extreme | Net calories < 800 for 2+ consecutive days | Nutrition alert |
| Protein critically low | < 0.6g per lb bodyweight for 5+ days | Protein alert |
| Weight stall | No change ± 0.5 lbs over 21 days despite consistent logging | Plateau alert |

```python
async def run_anomaly_detection(user_id: str):
    context = await build_member_context(user_id, days=7)
    anomalies = detect_anomalies(context)
    
    if not anomalies:
        return
    
    # Generate alert message
    alert_text = await generate_anomaly_alert(anomalies, context)
    
    # Save to daily_logs
    await db.execute("""
        UPDATE daily_logs
        SET anomaly_flagged = true, anomaly_note = $1
        WHERE user_id = $2 AND log_date = CURRENT_DATE
    """, alert_text, user_id)
    
    # Push notification
    await send_push_notification(
        user_id=user_id,
        title="FlamSanct Notice",
        body=anomalies[0]["short_message"],
        data={"screen": "ai_query"}
    )
    
    # Log AI request
    await log_ai_request(user_id, "anomaly", context, alert_text)
```

Anomaly alert tone: matter-of-fact. "Your sleep has averaged 5.4 hours for four days. Your RPE has been 8+ in three of the last four sessions. This is where overtraining starts." No panic. No coddling. Just data and implication.

---

## 5. Weekly Digest

Generated Sunday at 6:00 PM member's local timezone.

```python
async def generate_weekly_digest(user_id: str) -> str:
    context = await build_member_context(user_id, days=7)
    
    system_prompt = """You are the AI voice of FlamSanct writing a member's weekly digest.
Tone: dry, honest, brief. Like a good coach, not a cheerleader.
Structure:
1. What the data shows (2-3 sentences, specific numbers)
2. What's working (1-2 sentences)
3. What to watch (1-2 sentences)
4. One specific recommendation for next week (1 sentence)
No headers. No bullet points. Prose only. Under 200 words."""

    response = await claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=system_prompt,
        messages=[{"role": "user", "content": json.dumps(context)}]
    )
    
    digest_text = response.content[0].text
    
    # Save to daily_logs for that day
    await db.execute("""
        UPDATE daily_logs
        SET ai_digest_text = $1, ai_digest_generated_at = now()
        WHERE user_id = $2 AND log_date = CURRENT_DATE
    """, digest_text, user_id)
    
    # Push notification
    await send_push_notification(
        user_id=user_id,
        title="Your weekly digest is ready.",
        body="FlamSanct has reviewed your week.",
        data={"screen": "digest"}
    )
    
    return digest_text
```

**Expo — Digest Screen**  
Accessible from notification or from Home screen "Weekly Digest" card (shown Sundays).  
Displays: week date range, digest prose, link to detailed stats for the week.

---

## 6. Dietary Directive Generation

Triggered automatically when nutrition anomalies are detected. Also available on-demand by Admin.

```python
async def generate_dietary_directive(member_id: str, context: dict) -> str:
    chef = await get_assigned_chef(member_id)
    
    prompt = f"""Write a dietary directive for a chef based on this member's data.
Be specific and actionable. 2-3 sentences max. Address the chef directly.
Data: {json.dumps(context['nutrition'])}
Workout load: avg RPE {context['workouts']['avg_rpe']}, {context['workouts']['total_sessions']} sessions last 14 days.
Member goal: {context['member']['goals']}"""

    response = await claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}]
    )
    
    directive = response.content[0].text
    
    await db.execute("""
        INSERT INTO dietary_directives
        (member_id, chef_id, issued_by, directive_text, expires_at)
        VALUES ($1, $2, 'ai', $3, now() + INTERVAL '14 days')
    """, member_id, chef.id, directive)
    
    # Notify chef via Supabase Realtime
    await notify_chef(chef.id, member_id, directive)
```
