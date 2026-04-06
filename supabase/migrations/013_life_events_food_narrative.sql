-- Life event markers on evening check-in + food narrative

ALTER TABLE daily_logs ADD COLUMN life_event text;
ALTER TABLE daily_logs ADD COLUMN life_event_note text;

-- Narrative on food logs (manual description or photo context)
ALTER TABLE food_logs ADD COLUMN narrative text;
