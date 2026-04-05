# FS-2 — Daily Loop (Member)
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1

---

## 1. Overview

The daily loop is the core member experience. Every day has one anchor record (`daily_logs`) that collects sleep, mood, weight, the Stoic reflection, and links to that day's workouts and food logs. The loop is designed to take under 90 seconds for the minimum viable check-in. Depth is available but never required.

**The daily loop has two natural moments:**
- Morning: post-workout check-in (sleep, weight, mood, workout log)
- Evening: reflection (Stoic prompt, day notes, evening mood update)

Both are optional on any given day. The system records what it gets.

---

## 2. Daily Log Lifecycle

```
Date begins (midnight member timezone)
  → daily_logs row created automatically (via scheduled job or lazy on first access)
  → stoic_passage assigned (scheduled or tag-affinity fallback)

Morning (typically post-F3, ~6-7 AM)
  → Member opens app
  → Check-in card presented
  → Sleep, weight, mood logged
  → Workout logged (type, duration, RPE)
  → Calorie burn estimated and saved

Throughout day
  → Food logs created (self or chef)
  → Photo captures submitted

Evening (~8:30 PM)
  → Reflection reminder notification
  → Stoic passage displayed
  → Reflection text entered
  → Evening mood optionally updated

AI layer (async, background)
  → Anomaly detection runs after morning check-in
  → Weekly digest generated Sunday evening
```

---

## 3. API Endpoints

### Daily Log

**GET /v1/daily-logs/{date}**  
Get or create the daily log for the authenticated member.  
Date format: `YYYY-MM-DD`. Pass `today` as a shortcut (resolved to member's timezone).  
Role: member.  
Response: full `daily_logs` row + linked workout count + food log summary.

**PATCH /v1/daily-logs/{date}**  
Update any fields on the daily log. Partial updates supported.  
Role: member.  
Body (all optional):
```json
{
  "sleep_hours": 7.5,
  "sleep_quality": 4,
  "mood": 3,
  "mood_note": "Tired but showed up",
  "weight_lbs": 218.5,
  "stoic_reflection": "Held the line today. Nothing more."
}
```

**GET /v1/daily-logs**  
List daily logs for the authenticated member.  
Role: member.  
Query params: `?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=30`

### Workouts

**POST /v1/workouts**  
Log a workout for today (or a past date).  
Role: member.  
Body:
```json
{
  "log_date": "2026-04-05",
  "workout_type": "f3",
  "workout_label": "Bootcamp at The Forge",
  "duration_minutes": 45,
  "rpe": 8,
  "is_f3": true,
  "f3_ao": "The Forge",
  "f3_q": "Mitch",
  "notes": "Shield lock drills. Brutal."
}
```
On save: compute `estimated_calories_burned` using the calorie burn model (FS-0 §8). Save to workout row.

**GET /v1/workouts**  
List workouts for authenticated member.  
Query params: `?log_date=YYYY-MM-DD` or `?start=&end=`

**PATCH /v1/workouts/{id}**  
Edit a workout. Member can edit own workouts only.

**DELETE /v1/workouts/{id}**  
Soft delete (set `deleted_at`). Member can delete own workouts only.

### Stoic Passage

**GET /v1/stoic/today**  
Returns today's Stoic passage (from schedule or tag-affinity selection) plus the AI-generated personal frame for the authenticated member.  
Role: member.  
Response:
```json
{
  "data": {
    "passage": {
      "id": "uuid",
      "author": "Marcus Aurelius",
      "source": "Meditations, Book V",
      "passage": "You have power over your mind, not outside events. Realize this, and you will find strength."
    },
    "ai_frame": "Your last four sessions averaged an RPE of 8.2. Your sleep has been under 7 hours. Marcus is not telling you to ignore the fatigue — he is telling you that the fatigue is not the story. You deciding to show up is.",
    "reflection_saved": false
  }
}
```
The `ai_frame` is generated on first call of the day and cached on the `daily_logs` row. Subsequent calls return the cached frame.

**POST /v1/stoic/reflection**  
Save the member's written reflection for today.  
Body: `{ "reflection": "..." }`  
Updates `daily_logs.stoic_reflection` for today's date.

---

## 4. Stoic Passage Selection Logic

Run daily at 4:00 AM member timezone (via Railway scheduled job):

```python
async def assign_daily_passage(user_id: str, log_date: date):
    # 1. Check admin schedule
    scheduled = await db.fetchrow(
        "SELECT passage_id FROM stoic_schedule WHERE scheduled_date = $1",
        log_date
    )
    if scheduled:
        return scheduled["passage_id"]

    # 2. Tag affinity — look at member's last 7 days
    recent = await get_member_week_summary(user_id)
    tags = derive_tags_from_summary(recent)
    # e.g. high RPE + low sleep → ['endurance', 'hardship']
    # e.g. good sleep + consistent → ['discipline', 'reflection']

    # 3. Pick passage with matching tags, not used in last 90 days
    passage = await db.fetchrow("""
        SELECT id FROM stoic_passages
        WHERE is_active = true
        AND $1 && tags
        AND id NOT IN (
            SELECT stoic_passage_id FROM daily_logs
            WHERE user_id = $2
            AND log_date > NOW() - INTERVAL '90 days'
            AND stoic_passage_id IS NOT NULL
        )
        ORDER BY RANDOM()
        LIMIT 1
    """, tags, user_id)

    # 4. Fallback: any passage not used in 90 days
    if not passage:
        passage = await db.fetchrow("""
            SELECT id FROM stoic_passages
            WHERE is_active = true
            AND id NOT IN (
                SELECT stoic_passage_id FROM daily_logs
                WHERE user_id = $1
                AND log_date > NOW() - INTERVAL '90 days'
                AND stoic_passage_id IS NOT NULL
            )
            ORDER BY RANDOM() LIMIT 1
        """, user_id)

    return passage["id"]
```

---

## 5. AI Frame Generation

Called when member first accesses `/v1/stoic/today`. Cached after first generation.

```python
async def generate_stoic_frame(passage: dict, member_summary: dict) -> str:
    prompt = f"""You are the AI voice of FlamSanct, a daily discipline platform.
Your tone is dry, honest, and direct. No toxic positivity. No empty encouragement.
You tell the truth about what the data shows, and you connect it to the Stoic passage.

Today's passage:
Author: {passage['author']}
Source: {passage['source']}
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

    response = await claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text
```

---

## 6. Expo Screens

### 6.1 Home / Today Screen

The primary screen. Shows the current state of today's log.

**Sections (top to bottom):**

1. **Date + Phase badge** — "Saturday, April 5 · The Grind"
2. **Check-in card** (if morning check-in not yet done)
   - Sleep hours (slider or number input)
   - Sleep quality (1-5 icon selector)
   - Weight (number input, pre-filled with last logged)
   - Mood (1-5 icon selector)
   - Mood note (optional text, single line)
   - "Log Check-In" button
3. **Workout card** — shows today's workouts or "+ Log Workout" prompt
4. **Food summary card** — shows today's calories in / estimated calories out / net. Taps to food log screen (FS-3).
5. **Stoic card** — passage + AI frame + reflection text input. Collapses after reflection saved.
6. **AI feedback button** — "Ask FlamSanct" — navigates to on-demand AI query (FS-5).

### 6.2 Log Workout Sheet

Bottom sheet modal. Fields match POST /v1/workouts body.

- Workout type selector (F3 / Strength / Cardio / Mobility / Other)
- If F3: AO name field + Q name field
- Duration (minutes, number input)
- RPE slider (1-10 with descriptive labels: 1=rest, 5=moderate, 10=max)
- Notes (optional)
- Estimated burn shown live as RPE + duration change

### 6.3 History Screen

Calendar view. Each day shows:
- Dot if workout logged (color by intensity: green=easy, amber=moderate, red=hard)
- Dot if food logged
- Dot if reflection logged

Tap a day to view that day's full log (read-only for past dates).

### 6.4 Streak & Consistency Widget

Shown on Home screen below the date. Displays:
- Current consistency streak (days with at least one workout logged)
- Weekly workout count vs. personal average
- No comparison to other members on this screen (community screen only)

---

## 7. Push Notifications

| Notification | Trigger | Default Time |
|---|---|---|
| Morning check-in reminder | Daily, if check-in not done | 6:00 AM member TZ |
| Evening reflection reminder | Daily, if reflection not done | 8:30 PM member TZ |
| Chef affirmed your food photo | On chef affirmation | Immediate |
| Weekly digest ready | Sunday | 7:00 PM member TZ |
| AI anomaly alert | On anomaly detection | Immediate |
| New community post | Configurable, off by default | Immediate |

All notifications sent via Expo Push Notifications service. Push token saved to `users.push_token` during onboarding.

---

## 8. Scheduled Jobs (Railway Cron)

| Job | Schedule | Action |
|---|---|---|
| `assign_daily_passages` | 4:00 AM UTC | Create `daily_logs` rows and assign Stoic passages for all active members |
| `anomaly_detection` | 10:00 AM UTC | Check morning check-ins, flag anomalies, trigger alerts |
| `weekly_digest` | Sunday 6:00 PM member TZ | Generate and deliver weekly AI digest per member |
| `calorie_correction` | Monday 2:00 AM UTC | Update personal correction factors for members with 30+ days of data |
