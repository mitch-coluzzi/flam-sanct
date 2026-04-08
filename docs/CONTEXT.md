# FlamSanct — Claude Code Context
**Version:** 1.0
**Last Updated:** 2026-04-05
**Platform Version:** 0.2.0
**Purpose:** Claude Code build session context. Load at the start of every Claude Code session. Do not use for design sessions — use CLAUDE_CHAT_CONTEXT.md instead.

---

## 1. Project Identity

**Product:** FlamSanct
**Type:** Daily practice platform. Expo mobile app + web dashboard + FastAPI backend.
**Tagline:** Cast it on yourself. It stays on.
**Status:** Pre-build. All specs written. No code exists yet.

---

## 2. Repository Structure

```
flam-sanct/
├── api/                        # FastAPI backend (Railway)
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── daily_logs.py
│   │   ├── workouts.py
│   │   ├── food_logs.py
│   │   ├── chef.py
│   │   ├── ai.py
│   │   ├── benchmarks.py
│   │   ├── community.py
│   │   ├── messages.py
│   │   └── admin.py
│   ├── dependencies/
│   │   └── auth.py             # JWT validation, require_role()
│   ├── services/
│   │   ├── claude.py           # All Claude API calls
│   │   ├── stoic.py            # Passage selection logic
│   │   ├── nutrition.py        # USDA proxy, calorie math
│   │   ├── calorie_burn.py     # RPE burn model
│   │   ├── anomaly.py          # Anomaly detection
│   │   ├── digest.py           # Weekly digest generation
│   │   └── notifications.py    # Expo push
│   ├── jobs/                   # Railway cron jobs
│   │   ├── assign_passages.py
│   │   ├── anomaly_detection.py
│   │   ├── weekly_digest.py
│   │   └── calorie_correction.py
│   ├── models/                 # Pydantic models
│   └── requirements.txt
│
├── app/                        # Expo app (React Native + Web)
│   ├── app/                    # Expo Router file-based routing
│   │   ├── (auth)/
│   │   │   ├── login.tsx
│   │   │   └── signup.tsx
│   │   ├── (onboarding)/
│   │   │   └── index.tsx
│   │   ├── (member)/
│   │   │   ├── index.tsx       # Home / Today
│   │   │   ├── history.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── community.tsx
│   │   │   ├── messages.tsx
│   │   │   └── ai.tsx          # Ask FlamSanct
│   │   ├── (chef)/
│   │   │   ├── index.tsx       # Chef dashboard
│   │   │   ├── member/[id].tsx
│   │   │   └── recipes.tsx
│   │   └── (admin)/
│   │       ├── index.tsx
│   │       ├── users.tsx
│   │       ├── stoic.tsx
│   │       └── benchmarks.tsx
│   ├── components/
│   │   ├── ui/                 # Shared UI primitives
│   │   ├── member/             # Member-specific components
│   │   ├── chef/               # Chef-specific components
│   │   └── community/          # Feed and message components
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDailyLog.ts
│   │   ├── useRealtime.ts
│   │   └── useNotifications.ts
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   ├── api.ts              # FastAPI client (typed fetch)
│   │   └── constants.ts
│   ├── store/                  # Zustand state
│   └── package.json
│
├── supabase/
│   ├── migrations/             # SQL migration files
│   └── functions/
│       └── custom-claims/      # Auth hook edge function
│
├── docs/
│   ├── CONTEXT.md              # This file (Claude Code context)
│   ├── CLAUDE_CHAT_CONTEXT.md  # Design session context
│   └── sessions/               # All FS-0 through FS-7 spec files
│       ├── FS-0-ARCHITECTURE.md
│       ├── FS-1-AUTH-ROLES.md
│       ├── FS-2-DAILY-LOOP.md
│       ├── FS-3-NUTRITION.md
│       ├── FS-4-CHEF.md
│       ├── FS-5-AI-FEEDBACK.md
│       ├── FS-6-PROGRESS-BENCHMARKS.md
│       └── FS-7-COMMUNITY.md
│
└── CLAUDE.md                   # Claude Code rules
```

---

## 3. Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile / Web | Expo SDK 52+, React Native, TypeScript | Expo Router for file-based navigation |
| Backend | FastAPI, Python 3.12 | Hosted on Railway |
| Database | Supabase PostgreSQL | |
| Realtime | Supabase Realtime | Postgres Changes subscription |
| Auth | Supabase Auth | JWT, custom claims via Edge Function hook |
| Storage | Supabase Storage | 3 buckets: avatars, food-photos, community |
| AI | Anthropic Claude API | claude-sonnet-4-6, all AI calls in services/claude.py |
| Push | Expo Push Notifications | Token on users.push_token |
| Builds | Expo EAS | iOS + Android |
| USDA | FoodData Central API | Free, no key required for basic search |

---

## 4. Environment Variables

### API (Railway)
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
ANTHROPIC_API_KEY=
USDA_API_KEY=                   # Optional — increases rate limits
EXPO_ACCESS_TOKEN=              # For push notifications
RAILWAY_ENVIRONMENT=production
```

### App (Expo / EAS)
```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_BASE_URL=https://api.flamsanct.com/v1
```

---

## 5. API Conventions

**Base URL:** `https://api.flamsanct.com/v1`
**Auth header:** `Authorization: Bearer {jwt}` on all endpoints except `/auth/*`
**Role enforcement:** `Depends(require_role(["member"]))` injected per route

**Response envelope (success):**
```json
{ "data": {}, "error": null, "meta": { "timestamp": "..." } }
```

**Response envelope (error):**
```json
{ "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```

**Pagination:** Cursor-based. `?cursor={id}&limit={n}`

---

## 6. Build Order

Follow this sequence. Each step builds on the previous. Do not skip ahead.

| Step | Spec | Work |
|---|---|---|
| 1 | FS-0 | Supabase project setup. Run all migrations. Create storage buckets. |
| 2 | FS-1 | Supabase Auth config. Database trigger. Custom claims edge function. FastAPI skeleton + auth dependency. |
| 3 | FS-2 | Daily log endpoints. Workout endpoints. Stoic passage selection job. Expo home screen + check-in flow. |
| 4 | FS-3 | Food log endpoints. USDA search proxy. Claude Vision photo capture. Chef recipe endpoints. |
| 5 | FS-4 | Chef dashboard screens. Photo affirmation endpoint + screen. Directive acknowledgment. |
| 6 | FS-5 | Claude AI service. On-demand query endpoint + screen. Anomaly detection job. Weekly digest job. |
| 7 | FS-6 | Benchmark endpoints. PR detection. Progress screen + weight chart. |
| 8 | FS-7 | Community feed endpoints + screens. Supabase Realtime DM. Messages screens. |

---

## 7. Completed Work

Updated at the end of each Claude Code session.

| Session | Date | Version | Completed |
|---|---|---|---|
| — | 2026-04-05 | 0.1.0 | All specs written. Context files created. No code yet. |
| FS-0 | 2026-04-05 | 0.2.0 | All 20 tables created. RLS enabled on all. 14 indexes. 3 storage buckets (avatars, food-photos, community). |
| FS-1 | 2026-04-05 | 0.3.0 | Auth trigger, 29 RLS policies, custom claims edge function, FastAPI skeleton (auth dep, profile, admin endpoints). |
| FS-2 | 2026-04-05 | 0.4.0 | Daily log CRUD, workout CRUD w/ calorie burn, Stoic passage selection + AI frame, 3 services (calorie_burn, stoic, claude). |
| FS-3 | 2026-04-05 | 0.5.0 | Food log CRUD, photo capture w/ Claude Vision, chef affirm/adjust, USDA proxy, chef recipes, chef meal logging. |
| FS-4 | 2026-04-05 | 0.6.0 | Chef dashboard (members summary, pending affirms, directives + acknowledge), auto-DM on chef assignment. |
| FS-5 | 2026-04-05 | 0.7.0 | AI query endpoint (10/day), anomaly detection job, weekly digest job, member context builder, push notifications. |
| FS-6 | 2026-04-05 | 0.8.0 | Benchmarks (8 seeded), PR detection + push, benchmark results w/ trends, weight chart, progress summary. Schema: secondary_value/unit. |
| FS-7 | 2026-04-05 | 0.9.0 | Community feed (posts, Flam reactions, replies), DM conversations (create, list, send, mark read). 51 business endpoints. |
| Expo | 2026-04-05 | 0.95.0 | Expo app scaffolded. Auth screens (login/signup), 5-step onboarding, member tabs (6), chef tabs (3), admin stack. Brand palette applied. |
| Screens | 2026-04-05 | 0.96.0 | All member screens built: Today (check-in, workout log, nutrition, Stoic), History (day list + detail), Progress (weight, benchmarks, streak), Community (feed + Flam + compose), Messages (DM list + chat), Ask (AI query stub). Railway config added. |
| Full app | 2026-04-05 | 1.0.0 | AI wired to live API, chef screens (dashboard/affirm/recipes/member detail), admin panel (users/roles/assignments/Stoic curation), 30 Stoic passages seeded. All screens functional. |
| Feedback 1 | 2026-04-05 | 1.0.1 | Mood scale -4 to +4, sleep quality -2 to +2 inline, weekly weight, F3 AO dropdown, RPE labels, Stoic fallback, abstain/growth trackers, food responses, body photo monthly, life grades (B/M/S/R/F), AM/PM reflections, photo opt-out. |
| Tasks + Settings | 2026-04-06 | 1.0.5-1.0.7 | Tasks tab (Google-style), Tasks/Quotes toggle, Settings screen (profile, F3 name, abstain/growth labels, body photo toggle, view switcher, sign out), header redesign (date/THE GRIND/name). |
| Chef + AI | 2026-04-06 | 1.0.8-1.0.9 | Chef view switching, AI nutrition estimates on pending photos via Vision endpoint, tappable awaiting-review entries with full edit modal. |
| Day Complete | 2026-04-06 | 1.1.0 | Custom trackers single row +/- icons, life events, Day Complete shows full reflections, life grades, life event, post-completion journal entry. |
| Chef Web | 2026-04-07 | 1.2.0 | Next.js + Tailwind chef interface (web/), USDA recipe builder w/ ingredient search and live macros, member detail w/ weight trend + sparkline, AI conversation thread (chef ↔ member ↔ AI), @ai summon, real-time Supabase subscriptions both sides, auto-summon on food anomalies, photo library upload (camera or gallery). |

---

## 8. Current Build State

**Platform Version:** 1.3.0
**Last Claude Code Session:** Quick wins batch (2026-04-07)
**Current Step:** Sleep bug fixed, member parity (Progress chart + body photo timeline + Goals), Admin Insights tab live.
**Next Action:** Deploy web/ to Railway with chef. subdomain. Wire prompt_modifications approval flow. Brand assets.

---

## 9. Known Issues & Carry-Forward Items

None yet. This section tracks open bugs and carry-forward tasks between sessions.

Format:
```
- [OPEN] Description of issue (discovered Session X)
- [RESOLVED] Description of fix (Session Y)
```

---

## 10. Platform Version Log

Increment on each Claude Code session that produces shippable code.

| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-04-05 | Pre-build. Specs and context files only. |
| 0.2.0 | 2026-04-05 | FS-0 complete. 20 tables, RLS, indexes, 3 storage buckets. |
| 0.3.0 | 2026-04-05 | FS-1 complete. Auth trigger, 29 RLS policies, FastAPI skeleton, profile + admin endpoints. |
| 0.4.0 | 2026-04-05 | FS-2 complete. Daily logs, workouts, Stoic passage selection, AI frame generation, calorie burn model. |
| 0.5.0 | 2026-04-05 | FS-3 complete. Food logs, photo capture + Vision, USDA proxy, chef recipes, chef meal logging, daily macro totals. |
| 0.6.0 | 2026-04-05 | FS-4 complete. Chef dashboard, pending affirms, directives + acknowledge, auto-DM on assignment. |
| 0.7.0 | 2026-04-05 | FS-5 complete. AI query (10/day), anomaly detection, weekly digest, context builder, push notifications service. |
| 0.8.0 | 2026-04-05 | FS-6 complete. 8 benchmarks seeded, PR detection + push, secondary_value/unit columns, weight trend, progress summary. |
| 0.9.0 | 2026-04-05 | FS-7 complete. Community feed, Flam reactions, replies, DM conversations, messages. All 8 specs built. 51 business endpoints. |
| 0.95.0 | 2026-04-05 | Expo scaffold. Auth (login/signup), 5-step onboarding, member/chef/admin routing, brand palette applied. |
| 0.96.0 | 2026-04-05 | All member screens built. Today, History, Progress, Community, Messages, Ask FlamSanct. Railway config. |
| 1.0.0 | 2026-04-05 | MVP complete. AI wired to live API. Chef + admin screens. 30 Stoic passages. FastAPI on Railway. |
| 1.0.1 | 2026-04-05 | Mood -4/+4, sleep -2/+2, weekly weight, F3 AOs, RPE labels, Stoic fallback, abstain/growth, food responses, body photo, life grades, AM/PM reflections. |
| 1.0.5 | 2026-04-06 | Tasks tab (Google-style with Tasks/Quotes toggle), reorder, expand to add description. |
| 1.0.7 | 2026-04-06 | Settings screen with profile/labels/photo toggle/view switcher. Header redesign. |
| 1.0.8 | 2026-04-06 | Chef view switching. AI nutrition estimates on pending photos via /food-logs/{id}/estimate. |
| 1.0.9 | 2026-04-06 | Awaiting review tappable to edit details (food name, calories, macros, narrative). |
| 1.1.0 | 2026-04-06 | Day Complete shows full reflections + life grades + life event. Custom trackers single row +/-. Post-completion journal entry. |
| 1.2.0 | 2026-04-07 | Chef Next.js web interface (web/), USDA recipe builder, member detail w/ weight trend, AI conversation thread, @ai summon, real-time both sides, auto-summon on food anomalies, photo library upload. |
| 1.3.0 | 2026-04-07 | Sleep null-safe. Member Progress: sparkline + photo timeline + Goals. Admin Insights aggregation tab. AM/PM 4 PM cutoff with evening-first catch-up. |
| 1.2.1 | 2026-04-07 | AM/PM time-of-day cutoff (4 PM), evening-first ordering with catch-up at bottom (drops AM mood). |
| 1.3.0 | 2026-04-07 | Sleep quality null-safe save. Member Progress: weight sparkline + body photo timeline + Goals UI (full CRUD). Admin Insights tab — aggregates AI key points by category, shows recurring patterns for prompt refinement. New table: prompt_modifications. |

**Versioning convention:**
`0.X.0` — major spec or architecture additions during pre-launch
`0.X.Y` — bug fixes and minor additions within a build step
`1.0.0` — MVP launch-ready (all 8 specs built and tested)

---

## 11. How to Use This File

**At the start of every Claude Code session:**
Paste or attach this file and state: "I'm starting a FlamSanct Claude Code session. Here is the current code context: [attach]. Today I want to build: [Step X from build order]."

**At the end of every Claude Code session:**
Ask Claude Code to produce an updated version of this file with:
- Completed work table updated (session, date, version, what was built)
- Current build state updated (current step, next action)
- Known issues / carry-forward items updated
- Platform version log updated
- Version number incremented appropriately

**This file is for Claude Code build sessions only.**
For design sessions, use CLAUDE_CHAT_CONTEXT.md.
