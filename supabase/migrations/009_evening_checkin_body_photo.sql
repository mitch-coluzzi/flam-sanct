-- Evening check-in + body photo tracking

ALTER TABLE users ADD COLUMN last_body_photo_date date;
ALTER TABLE daily_logs ADD COLUMN evening_mood int CHECK (evening_mood BETWEEN -4 AND 4);
ALTER TABLE daily_logs ADD COLUMN body_photo_url text;

-- Body photos bucket: private, member-only
-- Created via Storage API: body-photos (private)
