-- FS-6: Benchmark schema amendment (bridge handoff) + seed data

-- Add secondary value columns for compound benchmarks (e.g. ruck weight)
ALTER TABLE benchmark_results ADD COLUMN secondary_value numeric(10,2);
ALTER TABLE benchmark_results ADD COLUMN secondary_unit text;

-- Seed benchmark library (8 benchmarks, replaces FS-0 original 10)
INSERT INTO benchmarks (name, unit, category, lower_is_better) VALUES
('1-Mile Run', 'time_seconds', 'run', true),
('5K Run', 'time_seconds', 'run', true),
('Hand Release Merkins (2 min)', 'reps', 'strength', false),
('Big Boy Sit-Ups (2 min)', 'reps', 'strength', false),
('Max Pull-Ups', 'reps', 'strength', false),
('Plank Hold', 'time_seconds', 'conditioning', false),
('Burpees (5 min)', 'reps', 'conditioning', false),
('2-Mile Ruck + Sandbag', 'time_seconds', 'f3', true);

-- Note: 2-Mile Ruck + Sandbag uses secondary_value for combined carry weight (lbs)
-- result_value = time in seconds, secondary_value = weight, secondary_unit = 'weight_lbs'
