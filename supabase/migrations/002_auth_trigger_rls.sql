-- FS-1 Auth: user creation trigger + RLS policies

-- ============================================================
-- Auto-insert public.users row on Supabase Auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'member'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS Policies
-- ============================================================

-- users: own row
CREATE POLICY "users_own" ON users
  FOR ALL USING (auth.uid() = id);

-- daily_logs: own logs
CREATE POLICY "daily_logs_own" ON daily_logs
  FOR ALL USING (auth.uid() = user_id);

-- workouts: own workouts
CREATE POLICY "workouts_own" ON workouts
  FOR ALL USING (auth.uid() = user_id);

-- food_logs: member sees own
CREATE POLICY "food_logs_member" ON food_logs
  FOR ALL USING (auth.uid() = user_id);

-- food_logs: chef sees assigned members
CREATE POLICY "food_logs_chef" ON food_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chef_assignments ca
      WHERE ca.chef_id = auth.uid()
      AND ca.member_id = food_logs.user_id
      AND ca.active = true
    )
  );

-- chef_recipes: chef owns their recipes
CREATE POLICY "chef_recipes_own" ON chef_recipes
  FOR ALL USING (auth.uid() = chef_id);

-- chef_recipes: members can read recipes from their assigned chef
CREATE POLICY "chef_recipes_member_read" ON chef_recipes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chef_assignments ca
      WHERE ca.chef_id = chef_recipes.chef_id
      AND ca.member_id = auth.uid()
      AND ca.active = true
    )
  );

-- chef_assignments: chef sees own assignments
CREATE POLICY "chef_assignments_chef" ON chef_assignments
  FOR SELECT USING (auth.uid() = chef_id);

-- chef_assignments: member sees own assignment
CREATE POLICY "chef_assignments_member" ON chef_assignments
  FOR SELECT USING (auth.uid() = member_id);

-- benchmarks: all authenticated users can read
CREATE POLICY "benchmarks_read" ON benchmarks
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- benchmark_results: own results
CREATE POLICY "benchmark_results_own" ON benchmark_results
  FOR ALL USING (auth.uid() = user_id);

-- stoic_passages: all authenticated users can read
CREATE POLICY "stoic_passages_read" ON stoic_passages
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- stoic_schedule: all authenticated users can read
CREATE POLICY "stoic_schedule_read" ON stoic_schedule
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- messages: conversation participants only
CREATE POLICY "messages_participant" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- conversations: participants only
CREATE POLICY "conversations_participant" ON conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

-- conversation_participants: participants can see their own conversations
CREATE POLICY "conversation_participants_own" ON conversation_participants
  FOR SELECT USING (auth.uid() = user_id);

-- community_posts: all authenticated can read, own can write
CREATE POLICY "community_posts_read" ON community_posts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "community_posts_write" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_posts_update" ON community_posts
  FOR UPDATE USING (auth.uid() = user_id);

-- community_reactions: all authenticated can read, own can write
CREATE POLICY "community_reactions_read" ON community_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "community_reactions_write" ON community_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_reactions_delete" ON community_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- community_replies: all authenticated can read, own can write
CREATE POLICY "community_replies_read" ON community_replies
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "community_replies_write" ON community_replies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ai_feedback_requests: own requests
CREATE POLICY "ai_feedback_own" ON ai_feedback_requests
  FOR ALL USING (auth.uid() = user_id);

-- member_goals: own goals
CREATE POLICY "member_goals_own" ON member_goals
  FOR ALL USING (auth.uid() = user_id);

-- dietary_directives: chef sees directives for their members
CREATE POLICY "dietary_directives_chef" ON dietary_directives
  FOR SELECT USING (auth.uid() = chef_id);

-- dietary_directives: member sees own directives
CREATE POLICY "dietary_directives_member" ON dietary_directives
  FOR SELECT USING (auth.uid() = member_id);

-- leaderboard_entries: all authenticated can read (Phase 2)
CREATE POLICY "leaderboard_read" ON leaderboard_entries
  FOR SELECT USING (auth.uid() IS NOT NULL);
