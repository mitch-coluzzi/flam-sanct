# FS-0 — FlamSanct Architecture & Data Model
**Version:** 1.0  
**Status:** Locked  
**Prerequisites:** None — this is the master reference document. All other specs (FS-1 through FS-7) reference this document for table names, field names, role definitions, and API conventions.

---

## 1. Product Overview

FlamSanct is a daily practice platform combining physical discipline tracking, chef-backed nutrition, AI feedback, Stoic reflection, and community accountability. Named after the Ultima Online incantation for Reactive Armor (*Flam Sanct* — flame protection), the product philosophy is: cast it on yourself every morning. It stays on.

**Tagline:** Cast it on yourself. It stays on.

---

## 2. Locked Stack

| Layer | Technology |
|---|---|
| Mobile / Web Frontend | Expo (React Native + Web), TypeScript |
| Backend API | FastAPI, Python, Railway |
| Database | Supabase PostgreSQL |
| Realtime / Chat | Supabase Realtime |
| Auth | Supabase Auth (JWT) |
| File Storage | Supabase Storage |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| Push Notifications | Expo Push Notifications |
| Mobile Builds | Expo EAS |
| Nutrition Search | USDA FoodData Central API (free) |

---

## 3. Roles

Four roles exist in the system. Only three are active at MVP.

### 3.1 Member
The primary user. Logs daily check-ins, food, workouts, sleep, mood, and reflections. Receives AI feedback. Participates in community feed. Has a paired Chef.

### 3.2 Chef
Assigned to one or more Members. Inputs meal data, manages the native recipe database, affirms or adjusts Member food photo captures, receives AI-generated dietary directives for their assigned Members.

### 3.3 Admin
Full platform access. Manages users, role assignments, chef-to-member pairings, Stoic passage library and daily queue, benchmark library, and system configuration. Initial Admin is the founder (Mitch).

### 3.4 Dietician *(Phase 2 — role designed now, not activated at MVP)*
Will have access to Member macro targets, trend data, and the ability to set nutritional directives. At MVP, the `dietician` role exists in the database and auth system but no UI or endpoints are built for it. A placeholder seat.

---

## 4. Database Schema

### Naming Conventions
- All tables: `snake_case`, plural
- All primary keys: `id uuid DEFAULT gen_random_uuid()`
- All timestamps: `created_at`, `updated_at` with `DEFAULT now()`
- Soft deletes: `deleted_at timestamptz` (null = active)
- Foreign keys: `{table_singular}_id`

---

### 4.1 `users`
Managed primarily by Supabase Auth. Extended with a profile row.

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text NOT NULL,
  display_name text,
  avatar_url text,
  role text NOT NULL CHECK (role IN ('member', 'chef', 'admin', 'dietician')),
  timezone text NOT NULL DEFAULT 'America/Chicago',
  weight_unit text NOT NULL DEFAULT 'lbs' CHECK (weight_unit IN ('lbs', 'kg')),
  push_token text,
  onboarded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
```

---

### 4.2 `chef_assignments`
Maps chefs to members. One chef can serve many members. One member has one active chef at a time.

```sql
CREATE TABLE chef_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chef_id uuid NOT NULL REFERENCES users(id),
  member_id uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (member_id, active) -- only one active chef per member
);
```

---

### 4.3 `daily_logs`
One row per member per calendar day. The anchor record for everything that happens in a day.

```sql
CREATE TABLE daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  -- Sleep
  sleep_hours numeric(4,2),
  sleep_quality int CHECK (sleep_quality BETWEEN 1 AND 5),
  -- Mood
  mood int CHECK (mood BETWEEN 1 AND 5),
  mood_note text,
  -- Stoic
  stoic_passage_id uuid REFERENCES stoic_passages(id),
  stoic_reflection text,
  -- Body
  weight_lbs numeric(5,2),
  -- AI
  ai_digest_generated_at timestamptz,
  ai_digest_text text,
  anomaly_flagged boolean DEFAULT false,
  anomaly_note text,
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, log_date)
);
```

---

### 4.4 `workouts`
Logged per session. Multiple workouts can exist per day.

```sql
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  workout_type text NOT NULL CHECK (workout_type IN ('f3', 'strength', 'cardio', 'mobility', 'other')),
  workout_label text, -- e.g. "Bootcamp at Forge", "Solo run"
  duration_minutes int NOT NULL,
  rpe int NOT NULL CHECK (rpe BETWEEN 1 AND 10), -- Rate of Perceived Exertion
  estimated_calories_burned int, -- computed field, updated by AI layer
  notes text,
  is_f3 boolean DEFAULT false,
  f3_ao text, -- Area of Operations (workout location name)
  f3_q text, -- Q (workout leader name)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

### 4.5 `food_logs`
Every food item consumed by a Member, regardless of source.

```sql
CREATE TABLE food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Source tracking
  source text NOT NULL CHECK (source IN ('chef', 'self', 'photo_capture', 'usda')),
  -- Food identification
  food_name text NOT NULL,
  usda_food_id text, -- FDC ID if from USDA
  chef_recipe_id uuid REFERENCES chef_recipes(id),
  -- Portion
  quantity numeric(8,2),
  unit text, -- g, oz, cup, serving, etc.
  -- Macros (all nullable, filled in progressively)
  calories int,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  fiber_g numeric(6,2),
  -- Photo capture flow
  photo_url text,
  photo_capture_status text CHECK (photo_capture_status IN ('pending', 'affirmed', 'adjusted')),
  chef_affirmed_at timestamptz,
  chef_affirmed_by uuid REFERENCES users(id),
  ai_portion_estimate text, -- Claude Vision raw output
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

### 4.6 `chef_recipes`
The native FlamSanct recipe database. Chef-created, reusable.

```sql
CREATE TABLE chef_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chef_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  -- Macros per serving
  serving_size text,
  calories_per_serving int,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  fiber_g numeric(6,2),
  -- Tags
  tags text[], -- ['high-protein', 'low-carb', 'recovery']
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

### 4.7 `benchmarks`
The predefined benchmark library. Admin-managed.

```sql
CREATE TABLE benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, -- e.g. "1-Mile Run", "Max Push-Ups (2 min)"
  description text,
  unit text NOT NULL, -- 'time_seconds', 'reps', 'weight_lbs', 'distance_miles'
  lower_is_better boolean DEFAULT true, -- false for reps/weight
  category text CHECK (category IN ('run', 'strength', 'conditioning', 'f3')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

---

### 4.8 `benchmark_results`
A Member's logged performance against a benchmark. Self-referential — compared only to own history.

```sql
CREATE TABLE benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  result_value numeric(10,2) NOT NULL, -- seconds, reps, lbs, miles
  log_date date NOT NULL,
  notes text,
  is_pr boolean DEFAULT false, -- personal record flag, computed on insert
  created_at timestamptz DEFAULT now()
);
```

---

### 4.9 `stoic_passages`
The Admin-curated Stoic library. Real quotes, attributed.

```sql
CREATE TABLE stoic_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author text NOT NULL, -- 'Marcus Aurelius', 'Epictetus', 'Seneca', 'Cato'
  source text, -- 'Meditations Book IV', 'Enchiridion', etc.
  passage text NOT NULL,
  tags text[], -- ['endurance', 'discipline', 'brotherhood', 'rest', 'hardship', 'reflection']
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

### 4.10 `stoic_schedule`
Admin-queued daily passages. If no row exists for a date, system selects by tag affinity.

```sql
CREATE TABLE stoic_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date date NOT NULL UNIQUE,
  passage_id uuid NOT NULL REFERENCES stoic_passages(id),
  admin_id uuid NOT NULL REFERENCES users(id),
  note text, -- admin's internal note on why this passage today
  created_at timestamptz DEFAULT now()
);
```

---

### 4.11 `messages`
Powers both the community feed DMs and chef/member direct messages.

```sql
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  body text,
  image_url text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system', 'ai_digest')),
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
```

---

### 4.12 `conversations`
A conversation is either a DM (two participants) or a group (community feed thread).

```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type text NOT NULL CHECK (conversation_type IN ('dm', 'group')),
  label text, -- null for DMs, name for group channels
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
```

---

### 4.13 `community_posts`
The async community feed. Separate from DMs.

```sql
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  body text,
  image_url text,
  -- Auto-generated from workout log (optional)
  linked_workout_id uuid REFERENCES workouts(id),
  linked_benchmark_id uuid REFERENCES benchmark_results(id),
  -- Reactions
  reaction_count int DEFAULT 0,
  reply_count int DEFAULT 0,
  -- Visibility
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  reaction text NOT NULL DEFAULT 'flam', -- FlamSanct-native reaction
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
```

---

### 4.14 `ai_feedback_requests`
Tracks on-demand AI queries from Members. Audit trail and rate limiting.

```sql
CREATE TABLE ai_feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('on_demand', 'anomaly', 'weekly_digest')),
  prompt_context jsonb, -- snapshot of member data sent to Claude
  response_text text,
  tokens_used int,
  created_at timestamptz DEFAULT now()
);
```

---

### 4.15 `member_goals`
A member's active goals. Cheerleaded by the AI layer.

```sql
CREATE TABLE member_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  goal_type text NOT NULL CHECK (goal_type IN ('weight', 'benchmark', 'consistency', 'nutrition', 'custom')),
  description text NOT NULL,
  target_value numeric(10,2),
  target_unit text,
  target_date date,
  is_active boolean DEFAULT true,
  achieved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

### 4.16 `dietary_directives`
AI or dietician-generated directives sent to the Chef for a Member.

```sql
CREATE TABLE dietary_directives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES users(id),
  chef_id uuid NOT NULL REFERENCES users(id),
  issued_by text NOT NULL CHECK (issued_by IN ('ai', 'dietician', 'admin')),
  directive_text text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
```

---

### 4.17 `leaderboards` *(Phase 2 — table built now, UI deferred)*

```sql
CREATE TABLE leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  result_value numeric(10,2) NOT NULL,
  rank int,
  period text CHECK (period IN ('weekly', 'monthly', 'alltime')),
  computed_at timestamptz DEFAULT now()
);
```

---

## 5. API Conventions

**Base URL:** `https://api.flamsanct.com/v1`

**Auth:** All endpoints require `Authorization: Bearer {jwt}` header except `/auth/*`.

**Response envelope:**
```json
{
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-04-05T10:00:00Z"
  }
}
```

**Error envelope:**
```json
{
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Daily log not found for this date."
  }
}
```

**Pagination:** Cursor-based. `?cursor={id}&limit={n}` on list endpoints.

**Role enforcement:** FastAPI dependency `require_role(["member", "admin"])` injected per route.

---

## 6. Supabase Realtime Channels

| Channel | Subscribers | Purpose |
|---|---|---|
| `conversation:{id}` | Participants | Live DM messages |
| `community:feed` | All members | New community posts |
| `directives:{chef_id}` | Chef | New dietary directives |
| `photo_affirm:{member_id}` | Member | Chef affirmed/adjusted photo capture |

---

## 7. Supabase Storage Buckets

| Bucket | Access | Contents |
|---|---|---|
| `avatars` | Public | User profile images |
| `food-photos` | Private (member + chef) | Food capture images |
| `community` | Public | Community post images |

---

## 8. Calorie Burn Model

Estimated burn computed per workout on save:

```
base_rate = MET_by_type[workout_type] * weight_kg * (duration_minutes / 60)
rpe_multiplier = 0.7 + (rpe / 10 * 0.6)  # scales 0.76 to 1.3
estimated_burn = base_rate * rpe_multiplier
```

MET values seeded: F3 bootcamp = 8.0, Strength = 5.0, Cardio = 7.0, Mobility = 3.0, Other = 5.0.

Self-correction: After 30+ days of data, the system compares predicted weight delta (calories in - calories out) against actual weight delta and applies a personal correction factor per member. Reviewed by AI feedback layer weekly.

---

## 8. Phase 2 Flags

The following are designed in schema but not built in UI or API at MVP:

- Dietician role, dashboard, macro-setting endpoints
- Leaderboard computation and display
- Community leaderboard toggle
- Nutritionix API fallback
- Correction factor auto-calibration (manual review only at MVP)

Every Phase 2 table exists at launch. No migrations needed to activate Phase 2 features.

---

## 9. Spec Dependency Map

```
FS-0 (this document)
├── FS-1 Auth & Roles
├── FS-2 Daily Loop (Member)
│   ├── FS-3 Nutrition & Food Log
│   └── FS-5 AI Feedback Layer
├── FS-4 Chef Interface
│   └── FS-3 Nutrition & Food Log
├── FS-6 Progress & Benchmarks
└── FS-7 Community
```

All specs are buildable independently after FS-1 is complete.
