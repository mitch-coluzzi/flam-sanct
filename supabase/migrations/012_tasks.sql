-- Personal task list (Google Tasks style)

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  completed boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_own" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_tasks_user_order ON tasks(user_id, completed, sort_order);
