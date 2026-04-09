-- Add personal calorie correction factor to users table
-- Used by calorie_correction.py job to self-calibrate burn estimates
ALTER TABLE users ADD COLUMN IF NOT EXISTS calorie_correction_factor NUMERIC(5,3) DEFAULT 1.000;
