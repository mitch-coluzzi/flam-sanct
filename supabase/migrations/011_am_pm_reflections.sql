-- Split reflections into AM and PM
ALTER TABLE daily_logs ADD COLUMN am_reflection text;
ALTER TABLE daily_logs ADD COLUMN pm_reflection text;

-- Original stoic_reflection column kept for backward compat
-- New flow: am_reflection saved with morning check-in, pm_reflection with evening
