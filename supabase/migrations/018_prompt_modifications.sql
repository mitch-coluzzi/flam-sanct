-- Admin learning loop: prompt_modifications table for approved AI refinements
-- Aggregates patterns from ai_key_points across conversations for admin review

CREATE TABLE prompt_modifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  pattern_text text NOT NULL,
  modification_text text NOT NULL,
  approved boolean DEFAULT false,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  source_message_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prompt_modifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_mods_admin" ON prompt_modifications FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

CREATE INDEX idx_prompt_mods_approved ON prompt_modifications(approved, category);
