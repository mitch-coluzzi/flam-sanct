-- Tasks: support quote lists alongside task lists
ALTER TABLE tasks ADD COLUMN list_type text NOT NULL DEFAULT 'task' CHECK (list_type IN ('task', 'quote'));
