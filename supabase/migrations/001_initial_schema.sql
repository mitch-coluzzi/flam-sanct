-- FS-0 Initial Schema Migration
-- FlamSanct v0.1.0
-- All 20 tables, correct FK order

-- ============================================================
-- 1. users (extends Supabase Auth)
-- ============================================================
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

-- ============================================================
-- 2. chef_assignments
-- ============================================================
CREATE TABLE chef_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chef_id uuid NOT NULL REFERENCES users(id),
  member_id uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (member_id, active)
);

-- ============================================================
-- 3. stoic_passages (needed before daily_logs FK)
-- ============================================================
CREATE TABLE stoic_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author text NOT NULL,
  source text,
  passage text NOT NULL,
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. daily_logs
-- ============================================================
CREATE TABLE daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  sleep_hours numeric(4,2),
  sleep_quality int CHECK (sleep_quality BETWEEN 1 AND 5),
  mood int CHECK (mood BETWEEN 1 AND 5),
  mood_note text,
  stoic_passage_id uuid REFERENCES stoic_passages(id),
  stoic_reflection text,
  weight_lbs numeric(5,2),
  ai_digest_generated_at timestamptz,
  ai_digest_text text,
  anomaly_flagged boolean DEFAULT false,
  anomaly_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, log_date)
);

-- ============================================================
-- 5. workouts
-- ============================================================
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  workout_type text NOT NULL CHECK (workout_type IN ('f3', 'strength', 'cardio', 'mobility', 'other')),
  workout_label text,
  duration_minutes int NOT NULL,
  rpe int NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  estimated_calories_burned int,
  notes text,
  is_f3 boolean DEFAULT false,
  f3_ao text,
  f3_q text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. chef_recipes
-- ============================================================
CREATE TABLE chef_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chef_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  serving_size text,
  calories_per_serving int,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  fiber_g numeric(6,2),
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 7. food_logs
-- ============================================================
CREATE TABLE food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  source text NOT NULL CHECK (source IN ('chef', 'self', 'photo_capture', 'usda')),
  food_name text NOT NULL,
  usda_food_id text,
  chef_recipe_id uuid REFERENCES chef_recipes(id),
  quantity numeric(8,2),
  unit text,
  calories int,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  fiber_g numeric(6,2),
  photo_url text,
  photo_capture_status text CHECK (photo_capture_status IN ('pending', 'affirmed', 'adjusted')),
  chef_affirmed_at timestamptz,
  chef_affirmed_by uuid REFERENCES users(id),
  ai_portion_estimate text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 8. benchmarks
-- ============================================================
CREATE TABLE benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL,
  lower_is_better boolean DEFAULT true,
  category text CHECK (category IN ('run', 'strength', 'conditioning', 'f3')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 9. benchmark_results
-- ============================================================
CREATE TABLE benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  result_value numeric(10,2) NOT NULL,
  log_date date NOT NULL,
  notes text,
  is_pr boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 10. stoic_schedule
-- ============================================================
CREATE TABLE stoic_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date date NOT NULL UNIQUE,
  passage_id uuid NOT NULL REFERENCES stoic_passages(id),
  admin_id uuid NOT NULL REFERENCES users(id),
  note text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 11. conversations
-- ============================================================
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type text NOT NULL CHECK (conversation_type IN ('dm', 'group')),
  label text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 12. conversation_participants
-- ============================================================
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- ============================================================
-- 13. messages
-- ============================================================
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

-- ============================================================
-- 14. community_posts
-- ============================================================
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  body text,
  image_url text,
  linked_workout_id uuid REFERENCES workouts(id),
  linked_benchmark_id uuid REFERENCES benchmark_results(id),
  reaction_count int DEFAULT 0,
  reply_count int DEFAULT 0,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- 15. community_reactions
-- ============================================================
CREATE TABLE community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  reaction text NOT NULL DEFAULT 'flam',
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- ============================================================
-- 16. community_replies
-- ============================================================
CREATE TABLE community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- 17. ai_feedback_requests
-- ============================================================
CREATE TABLE ai_feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('on_demand', 'anomaly', 'weekly_digest')),
  prompt_context jsonb,
  response_text text,
  tokens_used int,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 18. member_goals
-- ============================================================
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

-- ============================================================
-- 19. dietary_directives
-- ============================================================
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

-- ============================================================
-- 20. leaderboard_entries (Phase 2 — table only, no UI)
-- ============================================================
CREATE TABLE leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  result_value numeric(10,2) NOT NULL,
  rank int,
  period text CHECK (period IN ('weekly', 'monthly', 'alltime')),
  computed_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS: Enable on all tables
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chef_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stoic_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chef_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE stoic_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietary_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
CREATE INDEX idx_workouts_user_date ON workouts(user_id, log_date);
CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, log_date);
CREATE INDEX idx_benchmark_results_user ON benchmark_results(user_id, benchmark_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_community_reactions_post ON community_reactions(post_id);
CREATE INDEX idx_community_replies_post ON community_replies(post_id);
CREATE INDEX idx_chef_assignments_member ON chef_assignments(member_id) WHERE active = true;
CREATE INDEX idx_dietary_directives_chef ON dietary_directives(chef_id) WHERE is_active = true;
CREATE INDEX idx_member_goals_user ON member_goals(user_id) WHERE is_active = true;
CREATE INDEX idx_stoic_schedule_date ON stoic_schedule(scheduled_date);
CREATE INDEX idx_ai_feedback_user ON ai_feedback_requests(user_id, created_at);
CREATE INDEX idx_food_logs_photo_pending ON food_logs(user_id) WHERE photo_capture_status = 'pending';
