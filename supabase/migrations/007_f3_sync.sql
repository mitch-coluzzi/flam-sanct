-- F3 Nation integration — sync attendance to workouts

ALTER TABLE users ADD COLUMN f3_name text;
ALTER TABLE users ADD COLUMN f3_user_id text;
CREATE INDEX idx_users_f3_name ON users(f3_name) WHERE f3_name IS NOT NULL;

-- f3_name: member's F3 Nation name (e.g. "Her Call", "Mariah Carey")
-- f3_user_id: F3 Nation API user ID for direct lookups
-- Sync job matches attendance by f3_name, creates workout entries automatically
