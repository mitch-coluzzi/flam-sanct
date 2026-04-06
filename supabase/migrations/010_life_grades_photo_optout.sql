-- Body photo opt-out + life aspect grades on evening check-in

ALTER TABLE users ADD COLUMN body_photo_enabled boolean DEFAULT true;

-- Life aspect self-grades: -2 to +2 per category
ALTER TABLE daily_logs ADD COLUMN grade_body int CHECK (grade_body BETWEEN -2 AND 2);
ALTER TABLE daily_logs ADD COLUMN grade_emotion int CHECK (grade_emotion BETWEEN -2 AND 2);
ALTER TABLE daily_logs ADD COLUMN grade_financial int CHECK (grade_financial BETWEEN -2 AND 2);
ALTER TABLE daily_logs ADD COLUMN grade_relational int CHECK (grade_relational BETWEEN -2 AND 2);
ALTER TABLE daily_logs ADD COLUMN grade_spiritual int CHECK (grade_spiritual BETWEEN -2 AND 2);
