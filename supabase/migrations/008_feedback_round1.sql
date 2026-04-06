-- Feedback round 1: abstain/growth trackers, weekly weight, food responses

-- Abstain + Growth daily trackers
ALTER TABLE daily_logs ADD COLUMN abstain_hit boolean;
ALTER TABLE daily_logs ADD COLUMN growth_hit boolean;

-- Custom labels stored on user profile
ALTER TABLE users ADD COLUMN abstain_label text;
ALTER TABLE users ADD COLUMN growth_label text;

-- Weekly weight prompt tracking
ALTER TABLE users ADD COLUMN last_weigh_date date;

-- Food response tracker (optional, per meal)
CREATE TABLE food_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  log_date date NOT NULL,
  meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  gut_response text CHECK (gut_response IN ('fine', 'bloated', 'nauseous', 'upset', 'pain')),
  energy_response text CHECK (energy_response IN ('steady', 'crash', 'spike', 'sluggish')),
  note text,
  symptom_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE food_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "food_responses_own" ON food_responses FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_food_responses_user_date ON food_responses(user_id, log_date);
