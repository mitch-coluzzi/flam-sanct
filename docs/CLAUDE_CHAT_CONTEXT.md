# FlamSanct — Claude Chat Context
**Version:** 1.1
**Last Updated:** 2026-04-05
**Purpose:** Design session context. Load this file at the start of any Claude.ai design session for FlamSanct. Do not use for Claude Code sessions — use docs/CONTEXT.md instead.

---

## 1. Product Identity

**Name:** FlamSanct
**Origin:** Ultima Online incantation for Reactive Armor. *Flam* = flame. *Sanct* = protection. Cast it on yourself. It stays on.
**Tagline:** Cast it on yourself. It stays on.
**Domain:** TBD (flamsanct.com or .co — check availability)
**Type:** Standalone product. Not affiliated with SoldFast. Separate LLC, separate codebase, separate infrastructure.

**Philosophy:** FlamSanct is a daily practice platform — not a fitness tracker. The F3 workout is the anchor. Food and recovery are the support system. Stoic reflection is the inner work. The chef and AI are the infrastructure that make it sustainable. The community is what makes it stick.

**Origin story:** Built by a licensed real estate broker and F3 PAX in Des Moines, Iowa who starts every day with the hardest thing he can do. Everything after that gets easier. Named after a UO spell. Runs on discipline, not motivation.

---

## 2. Founding Context

**Founder:** Mitch (Admin role, IA-DSM, F3 PAX)
**Initial cohort:** F3 DSM brotherhood — motivated, accountable, already showing up
**Chef:** Full-time chef with excess capacity — primary nutrition input source
**Dietician:** To be sourced via Upwork at monthly consulting cadence (Phase 2 activation)
**Distribution:** F3 community initial, standalone brand long-term
**Revenue model:** Monthly subscription. Chef capacity monetized. Dietician as quality layer.

---

## 3. Locked Decisions Log

This section records every locked architectural and product decision. Do not re-litigate these in design sessions without explicit reason. Reference this log when new decisions conflict with existing ones.

| # | Decision | Locked |
|---|---|---|
| D-01 | Stack: Expo (RN + Web) · FastAPI · Supabase · Railway · Claude API | 2026-04-05 |
| D-02 | Mobile-first via Expo. Web dashboard included via Expo Web. Same codebase. | 2026-04-05 |
| D-03 | Roles at MVP: Member, Chef, Admin. Dietician designed, Phase 2 only. | 2026-04-05 |
| D-04 | Chef assigned per member. One active chef per member at a time. | 2026-04-05 |
| D-05 | Nutrition: USDA FoodData Central (member self-log) + FlamSanct native chef recipe DB + Claude Vision (photo capture). Nutritionix Phase 2. | 2026-04-05 |
| D-06 | Benchmarks: predefined library, admin-managed, self-referential (you vs. you only). | 2026-04-05 |
| D-07 | Community: async feed (posts/reactions/replies) + real-time DM. Supabase Realtime. | 2026-04-05 |
| D-08 | Leaderboards: schema built at MVP, UI deferred to Phase 2. | 2026-04-05 |
| D-09 | Stoic layer: admin-curated real passages (attributed) + Claude personalizes frame per member using recent data. Admin queues passages by date. | 2026-04-05 |
| D-10 | AI feedback: on-demand query (10/day), anomaly detection (daily), weekly digest (Sunday). | 2026-04-05 |
| D-11 | Calorie burn: RPE + weight + workout type. Self-correcting model after 30 days of data. | 2026-04-05 |
| D-12 | Reaction: one native "Flam" reaction per post. No weight data ever visible in community. | 2026-04-05 |
| D-13 | Auth: Supabase Auth + JWT. Role encoded as custom claim `app_role`. Tokens stored in expo-secure-store. | 2026-04-05 |
| D-14 | Storage: Supabase Storage. Buckets: avatars (public), food-photos (private), community (public). | 2026-04-05 |
| D-15 | Notifications: Expo Push Notifications. Push token stored on users table. | 2026-04-05 |
| D-16 | Phase label: "The Grind" is the founder's current active phase. Phase labels are admin-assigned per member. | 2026-04-05 |

---

## 4. Spec Series

All eight specs are complete and Claude Code-ready. Each spec is a standalone markdown file in `docs/sessions/`.

| Spec | File | Status | Contents |
|---|---|---|---|
| FS-0 | FS-0-ARCHITECTURE.md | Locked | Master data model, all tables, API conventions, Realtime channels, calorie burn model, phase 2 flags |
| FS-1 | FS-1-AUTH-ROLES.md | Locked | Supabase Auth, FastAPI JWT, RLS policies, onboarding flow, environment variables |
| FS-2 | FS-2-DAILY-LOOP.md | Locked | Daily log lifecycle, workout logging, Stoic passage selection, AI frame generation, push notifications, cron jobs |
| FS-3 | FS-3-NUTRITION.md | Locked | Food log (3 paths), photo capture, USDA proxy, chef recipe DB, Claude Vision estimation, dietary directives |
| FS-4 | FS-4-CHEF.md | Locked | Chef dashboard, photo affirmation, member detail, directive acknowledgment, chef↔member DM auto-creation |
| FS-5 | FS-5-AI-FEEDBACK.md | Locked | On-demand query, anomaly detection thresholds, weekly digest, FlamSanct AI voice spec |
| FS-6 | FS-6-PROGRESS-BENCHMARKS.md | Locked | Benchmark library (10 seeded), PR detection, goal cheerleading, weight trend, Phase 2 leaderboard placeholder |
| FS-7 | FS-7-COMMUNITY.md | Locked | Feed API, Flam reaction, Supabase Realtime DM, auto-post from workout/benchmark, all Expo screens |

---

## 5. Database Tables (FS-0 Summary)

Quick reference. Full schema in FS-0.

| Table | Purpose |
|---|---|
| `users` | All roles. Extends Supabase Auth. |
| `chef_assignments` | Chef ↔ member pairings |
| `daily_logs` | One row per member per day. Anchor record. |
| `workouts` | Workout sessions. Multiple per day allowed. |
| `food_logs` | Every food item. Source-tracked (chef/self/photo/usda). |
| `chef_recipes` | Chef's native recipe database. |
| `benchmarks` | Predefined benchmark library (admin-managed). |
| `benchmark_results` | Member results. PR flagged on insert. |
| `stoic_passages` | Curated passage library (admin-managed). |
| `stoic_schedule` | Admin-queued passages by date. |
| `conversations` | DM and group conversation containers. |
| `conversation_participants` | Junction: user ↔ conversation. |
| `messages` | All messages (DM and system). |
| `community_posts` | Async feed posts. |
| `community_reactions` | Flam reactions. One per user per post. |
| `community_replies` | Threaded replies on feed posts. |
| `ai_feedback_requests` | Audit log of all Claude API calls. |
| `member_goals` | Active goals per member. |
| `dietary_directives` | AI/admin directives sent to chef. |
| `leaderboard_entries` | Phase 2. Built now, not rendered. |

---

## 6. AI Voice & Tone

The FlamSanct AI voice is a core product asset. Every Claude API call should be prompted to this standard.

**Tone:** Dry. Honest. Direct. Brief.
**Not:** Cheerful, motivational-poster, empty, padded, sycophantic.
**Model:** A good coach who tells you the truth because they respect you enough to.
**Reference phrase:** "Your sleep has averaged 5.4 hours for four days. Your RPE has been 8+ in three of the last four sessions. This is where overtraining starts."

Never say: "Great job," "You're doing amazing," "Keep it up," "You should be proud."
Always say: What the data shows. What it implies. What to do about it.

---

## 7. Phase 2 Roadmap (Not In Scope for MVP)

Items designed and schema-ready but not built at launch:

- Dietician role dashboard + macro-setting endpoints
- Community leaderboards (computation job + UI)
- Nutritionix API fallback for restaurant/branded foods
- Calorie burn personal correction factor auto-calibration
- Community leaderboard toggle (admin-controlled per cohort)
- Revenue / subscription billing layer
- Multi-region / multi-cohort admin tooling

---

## 8. Open Design Questions

Items not yet locked. Discuss in future design sessions.

| # | Question | Notes |
|---|---|---|
| OD-01 | Domain — flamsanct.com or .co? | Check availability |
| OD-02 | Subscription pricing model — flat monthly per member? Chef tier pricing? | Defer until MVP validated |
| OD-03 | Phase label system — how does a member advance phases? Admin-assigned only or self-declared? | Partially locked (admin-assigned), rules not yet defined |
| OD-04 | Stoic passage seed library — source and curation process? | Needs a session to build the initial 365-passage library |
| OD-05 | Admin panel — web-only or within Expo app? | Not specced. Likely web-only for admin functions. |
| OD-06 | Onboarding for chef role — how does a new chef learn the system? | Not yet designed |

---

## 9. Session Log

| Version | Date | Session Summary |
|---|---|---|
| 1.0 | 2026-04-05 | Founding design session. Full product concept locked. Stack locked. All 8 specs written. Both context files created. |
| 1.1 | 2026-04-05 | FS-0 build complete. All 20 tables, RLS, 14 indexes, 3 storage buckets deployed to Supabase. |
| 1.2 | 2026-04-05 | FS-1 build complete. Auth trigger, 29 RLS policies, custom claims edge function, FastAPI skeleton with auth + profile + admin endpoints. |
| 1.3 | 2026-04-05 | FS-2 build complete. Daily log CRUD, workout CRUD with calorie burn model, Stoic passage selection + AI frame generation, 3 services. |
| 1.4 | 2026-04-05 | FS-3 build complete. Food log CRUD, photo capture with Claude Vision, chef affirm/adjust, USDA search proxy, chef recipe CRUD, chef meal logging for members. |
| 1.5 | 2026-04-05 | FS-4 build complete. Chef dashboard (member summaries, pending affirms, directives + acknowledge), auto-DM conversation created on chef assignment. |
| 1.6 | 2026-04-05 | FS-5 build complete. On-demand AI query (10/day rate limit), anomaly detection job (6 threshold conditions), weekly digest job, full member context builder, Expo push notification service. |
| 1.7 | 2026-04-05 | FS-6 build complete. 8 benchmarks seeded (bridge amendment applied), PR detection with push, secondary_value/unit for ruck, weight trend endpoint, progress summary. |
| 1.8 | 2026-04-05 | FS-7 build complete. Community feed (posts/reactions/replies), DM conversations (create/list/send/read). ALL 8 SPECS BUILT. 51 business endpoints. Backend API complete. |
| 1.9 | 2026-04-05 | Expo app scaffolded. Auth screens (login/signup), 5-step onboarding, member tabs (6), chef tabs (3), admin stack. Supabase client + Zustand + React Query + auth hook. Brand palette from FLAMSANCT_BRAND_BRIEF.md applied to all screens. |
| 2.0 | 2026-04-05 | All member screens built with live Supabase: Today (check-in, workout modal, nutrition summary, Stoic reflection), History (day list w/ detail expand), Progress (weight delta, benchmarks w/ PR detection, streak), Community (feed, Flam toggle, compose), Messages (conversation list, DM chat), Ask FlamSanct (AI query stub). Railway deployment config added. |

---

## 10. How to Use This File

**At the start of a design session:**
Load this file and state: "I'm starting a FlamSanct design session. Here is the current chat context: [paste or attach]. Today I want to work on: [topic]."

**At the end of a design session:**
Ask Claude to produce an updated version of this file reflecting any new locked decisions, resolved open questions, or new open questions surfaced. Increment the version number. Update the session log.

**This file is for Claude.ai design sessions only.**
For Claude Code build sessions, use docs/CONTEXT.md.
