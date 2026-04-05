-- Mood scale: -4 to +4 (therapist scale, centered on zero)

ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_mood_check;
ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_mood_check CHECK (mood BETWEEN -4 AND 4);

CREATE TABLE mood_scale (
  value int PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL
);

INSERT INTO mood_scale (value, label, description) VALUES
(-4, 'Crisis',     'Cannot function. Need help.'),
(-3, 'Struggling', 'Everything feels heavy.'),
(-2, 'Low',        'Off. Going through the motions.'),
(-1, 'Flat',       'Not bad, just not there.'),
( 0, 'Neutral',    'Baseline. Nothing to report.'),
( 1, 'Steady',     'Present. Doing the work.'),
( 2, 'Solid',      'Sharp. Locked in.'),
( 3, 'Strong',     'Firing on all cylinders.'),
( 4, 'Peak',       'Rare day. Everything clicking.');

-- Notes:
-- -4 Crisis: triggers immediate anomaly alert (single-day, no trend required)
-- avg mood <= -2 for 3+ days: triggers anomaly detection
-- AI context should send both raw value and label
