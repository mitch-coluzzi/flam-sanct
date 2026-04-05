-- Sleep quality: -2 to +2 (inline with hours input)
-- Designed for wearable replacement: HR/HRV data will override this field

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_sleep_quality_check;
ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_sleep_quality_check CHECK (sleep_quality BETWEEN -2 AND 2);

-- Scale:
-- -2: Terrible
-- -1: Poor
--  0: Average
-- +1: Good
-- +2: Excellent
