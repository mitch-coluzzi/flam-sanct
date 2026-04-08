-- Directive comments: open thread between member, chef, AI on each directive
CREATE TABLE directive_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id uuid NOT NULL REFERENCES dietary_directives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  author_role text NOT NULL CHECK (author_role IN ('member', 'chef', 'admin', 'ai')),
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE directive_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_directive_comments_directive ON directive_comments(directive_id, created_at);

CREATE POLICY "directive_comments_member" ON directive_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM dietary_directives d WHERE d.id = directive_id AND d.member_id = auth.uid())
);
CREATE POLICY "directive_comments_chef" ON directive_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM dietary_directives d WHERE d.id = directive_id AND d.chef_id = auth.uid())
);

-- AI message support on the existing messages table
-- Lets AI insights live in the chef↔member DM thread as a "third voice"
-- with extractable key points and topic categories.
ALTER TABLE messages ADD COLUMN is_pinned boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN ai_key_points text[];
ALTER TABLE messages ADD COLUMN ai_category text;

-- ai_category: 'nutrition', 'recovery', 'training', 'wellbeing'
-- ai_key_points: array of extracted bullet points for surfacing in UI
-- Existing message_type 'ai_digest' is used for these messages
