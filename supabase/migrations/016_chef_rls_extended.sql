-- Chef RLS extensions: read assigned members' profiles, workouts, daily_logs
-- + update food_logs (affirm/adjust photo captures)

CREATE POLICY "users_chef_read" ON users FOR SELECT USING (
  EXISTS (SELECT 1 FROM chef_assignments ca WHERE ca.chef_id = auth.uid() AND ca.member_id = users.id AND ca.active = true)
);

CREATE POLICY "food_logs_chef_update" ON food_logs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM chef_assignments ca WHERE ca.chef_id = auth.uid() AND ca.member_id = food_logs.user_id AND ca.active = true)
);

CREATE POLICY "workouts_chef" ON workouts FOR SELECT USING (
  EXISTS (SELECT 1 FROM chef_assignments ca WHERE ca.chef_id = auth.uid() AND ca.member_id = workouts.user_id AND ca.active = true)
);

CREATE POLICY "daily_logs_chef" ON daily_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM chef_assignments ca WHERE ca.chef_id = auth.uid() AND ca.member_id = daily_logs.user_id AND ca.active = true)
);
