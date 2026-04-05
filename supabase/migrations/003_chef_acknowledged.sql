-- FS-4: Add chef acknowledgment timestamp to dietary directives
ALTER TABLE dietary_directives ADD COLUMN chef_acknowledged_at timestamptz;
