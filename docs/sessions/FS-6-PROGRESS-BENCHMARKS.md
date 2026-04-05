# FS-6 — Progress & Benchmarks
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** FS-0, FS-1, FS-2

---

## 1. Overview

Progress tracking in FlamSanct is entirely self-referential. No member sees another member's weight or benchmark results on the Progress screen. Community leaderboards are a Phase 2 toggle — the schema is built now, the UI is not.

---

## 2. Benchmark Library (Admin-Seeded)

Initial seed data for `benchmarks` table:

| Name | Unit | Category | Lower is Better |
|---|---|---|---|
| 1-Mile Run | time_seconds | run | true |
| 5K Run | time_seconds | run | true |
| Max Push-Ups (2 min) | reps | strength | false |
| Max Pull-Ups | reps | strength | false |
| Max Burpees (5 min) | reps | conditioning | false |
| Plank Hold | time_seconds | conditioning | false |
| Back Squat (1RM) | weight_lbs | strength | false |
| Deadlift (1RM) | weight_lbs | strength | false |
| F3 Murph (with vest) | time_seconds | f3 | true |
| F3 Deck of Cards | time_seconds | f3 | true |

Admin can add, edit, deactivate benchmarks via Admin panel.

---

## 3. API Endpoints

**GET /v1/benchmarks**  
List all active benchmarks.  
Role: any authenticated user.

**POST /v1/benchmark-results**  
Log a benchmark result.  
Role: member.  
Body:
```json
{
  "benchmark_id": "uuid",
  "result_value": 487,
  "log_date": "2026-04-05",
  "notes": "First attempt post-injury. Felt strong."
}
```
On save: check if this is a PR for this member. If `result_value` is better than all previous results for this benchmark, set `is_pr = true`. If PR, trigger a community post prompt.

**GET /v1/benchmark-results**  
Get all benchmark results for authenticated member, grouped by benchmark.  
Role: member.  
Response per benchmark:
```json
{
  "benchmark": { "name": "1-Mile Run", "unit": "time_seconds" },
  "results": [
    { "result_value": 512, "log_date": "2026-01-15", "is_pr": false },
    { "result_value": 487, "log_date": "2026-04-05", "is_pr": true }
  ],
  "pr": 487,
  "trend": "improving",
  "delta_pct": -4.9
}
```

**GET /v1/progress/weight**  
Weight trend for authenticated member.  
Query: `?days=90`  
Returns: array of `{ date, weight_lbs }` data points + trend calculation.

**GET /v1/progress/summary**  
Full progress summary for authenticated member. Used by AI feedback layer and Progress screen.

---

## 4. Personal Records & Goal Cheerleading

When a PR is logged:
1. `is_pr = true` on the result row
2. Push notification: *"New PR — 1-Mile Run. 487 seconds. Down from 512."*
3. Prompt appears in app: "Share this to the community feed?" (member opt-in)
4. AI cheerlead message generated (brief, honest, not gushing):
   > *"4.9% faster than your previous best. That's what 11 weeks of consistency does."*

When a goal is approaching or achieved:
- `member_goals.achieved_at` set when target reached
- Push notification with AI-generated one-liner
- Goal card on Progress screen updates state

---

## 5. Expo Screens

### 5.1 Progress Screen

**Top section — Weight**
- Line chart: weight over time (30/60/90 day toggle)
- Current weight, starting weight, delta
- Trend indicator (arrow + percentage)

**Benchmarks section**
- Card per benchmark the member has logged at least once
- Shows: PR, last result, trend arrow, mini sparkline
- Tap → Benchmark Detail screen

**Goals section**
- Active goals list
- Progress bar per goal (where measurable)
- "Mark Achieved" manual option
- "+ New Goal" button

**Phase badge**
- Current phase label ("The Grind")
- Days in current phase
- Streak counter

### 5.2 Benchmark Detail Screen

- Full history of results for one benchmark
- Line chart (time on X, result on Y)
- PR highlighted
- "Log New Result" button → Log Result Sheet

### 5.3 Log Result Sheet

Bottom sheet:
- Benchmark name (pre-selected)
- Result input (unit-appropriate: time picker for seconds, number for reps/weight)
- Date (defaults to today, can back-date)
- Notes field
- Submit → POST /v1/benchmark-results
