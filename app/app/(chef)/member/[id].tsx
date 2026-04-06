import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../store/auth";
import { supabase } from "../../../lib/supabase";

const MOOD_LABELS: Record<number, string> = {
  [-4]: "Crisis", [-3]: "Struggling", [-2]: "Low", [-1]: "Flat",
  [0]: "Neutral", [1]: "Steady", [2]: "Solid", [3]: "Strong", [4]: "Peak",
};

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [foods, setFoods] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const profile = useAuthStore((s) => s.profile);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { if (id) loadMember(); }, [id]);

  const loadMember = async () => {
    setLoading(true);
    const { data: u } = await supabase.from("users").select("*").eq("id", id).single();
    setMember(u);

    const { data: log } = await supabase.from("daily_logs").select("*").eq("user_id", id).eq("log_date", today).single();
    setTodayLog(log);

    const { data: w } = await supabase.from("workouts").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setWorkouts(w || []);

    const { data: f } = await supabase.from("food_logs").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setFoods(f || []);

    const { data: d } = await supabase.from("dietary_directives").select("*").eq("member_id", id).eq("chef_id", profile?.id).eq("is_active", true);
    setDirectives(d || []);

    setLoading(false);
  };

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  const calIn = foods.reduce((s, f) => s + (f.calories || 0), 0);
  const calOut = workouts.reduce((s, w) => s + (w.estimated_calories_burned || 0), 0);

  return (
    <ScrollView style={st.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={st.name}>{member?.display_name || member?.full_name}</Text>

      {/* Today's check-in */}
      <View style={st.card}>
        <Text style={st.cardTitle}>Today</Text>
        {todayLog ? (
          <>
            {todayLog.sleep_hours && <Text style={st.stat}>Sleep: {todayLog.sleep_hours}h</Text>}
            {todayLog.mood !== null && todayLog.mood !== undefined && <Text style={st.stat}>Mood: {MOOD_LABELS[todayLog.mood] || todayLog.mood}</Text>}
            {todayLog.weight_lbs && <Text style={st.stat}>Weight: {todayLog.weight_lbs} lbs</Text>}
          </>
        ) : (
          <Text style={st.muted}>No check-in yet today.</Text>
        )}
      </View>

      {/* Nutrition */}
      <View style={st.card}>
        <Text style={st.cardTitle}>Nutrition</Text>
        <View style={st.statsRow}>
          <View style={st.statBox}><Text style={st.statNum}>{calIn}</Text><Text style={st.statLabel}>IN</Text></View>
          <View style={st.statBox}><Text style={st.statNum}>{calOut}</Text><Text style={st.statLabel}>OUT</Text></View>
          <View style={st.statBox}><Text style={[st.statNum, { color: "#C0632A" }]}>{calIn - calOut}</Text><Text style={st.statLabel}>NET</Text></View>
        </View>
        {foods.map((f) => (
          <View key={f.id} style={st.foodRow}>
            <Text style={st.foodName}>{f.food_name}</Text>
            <Text style={st.foodCal}>{f.calories || "?"} cal</Text>
          </View>
        ))}
        {foods.length === 0 && <Text style={st.muted}>No food logged.</Text>}
      </View>

      {/* Workouts */}
      <View style={st.card}>
        <Text style={st.cardTitle}>Workouts</Text>
        {workouts.map((w) => (
          <View key={w.id} style={st.wRow}>
            <Text style={st.wType}>{w.is_f3 ? `F3 — ${w.f3_ao}` : w.workout_label || w.workout_type}</Text>
            <Text style={st.wMeta}>{w.duration_minutes}min · RPE {w.rpe} · ~{w.estimated_calories_burned} cal</Text>
          </View>
        ))}
        {workouts.length === 0 && <Text style={st.muted}>No workouts today.</Text>}
      </View>

      {/* Directives */}
      {directives.length > 0 && (
        <View style={st.card}>
          <Text style={st.cardTitle}>Active Directives</Text>
          {directives.map((d) => (
            <Text key={d.id} style={st.directiveText}>{d.directive_text}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  name: { fontSize: 24, fontWeight: "800", color: "#F0EDE6", marginBottom: 20 },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: "#3D3C38" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#C0632A", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  stat: { fontSize: 14, color: "#9C9A94", marginBottom: 4 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 12 },
  statBox: { alignItems: "center" },
  statNum: { fontSize: 20, fontWeight: "800", color: "#F0EDE6" },
  statLabel: { fontSize: 11, fontWeight: "600", color: "#9C9A94", letterSpacing: 1.5 },
  muted: { color: "#5C5A54", fontSize: 14, fontStyle: "italic" },
  foodRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  foodName: { fontSize: 14, color: "#F0EDE6" },
  foodCal: { fontSize: 13, color: "#9C9A94" },
  wRow: { marginBottom: 8 },
  wType: { fontSize: 14, fontWeight: "600", color: "#F0EDE6" },
  wMeta: { fontSize: 12, color: "#9C9A94", marginTop: 2 },
  directiveText: { fontSize: 14, color: "#F0EDE6", lineHeight: 20, marginBottom: 8 },
});
