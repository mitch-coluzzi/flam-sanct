import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface DayData {
  log_date: string;
  sleep_hours: number | null;
  mood: number | null;
  weight_lbs: number | null;
  stoic_reflection: string | null;
  workout_count: number;
  food_count: number;
}

const MOODS = ["", "Rough", "Low", "Okay", "Good", "Great"];

export default function HistoryScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [dayWorkouts, setDayWorkouts] = useState<any[]>([]);
  const [range, setRange] = useState(14);

  const userId = profile?.id;

  useEffect(() => {
    if (!userId) return;
    loadHistory();
  }, [userId, range]);

  const loadHistory = async () => {
    if (!userId) return;
    setLoading(true);
    const start = new Date();
    start.setDate(start.getDate() - range);
    const startStr = start.toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("daily_logs")
      .select("log_date, sleep_hours, mood, weight_lbs, stoic_reflection")
      .eq("user_id", userId)
      .gte("log_date", startStr)
      .order("log_date", { ascending: false });

    const { data: workouts } = await supabase
      .from("workouts").select("log_date").eq("user_id", userId).gte("log_date", startStr);
    const { data: foods } = await supabase
      .from("food_logs").select("log_date").eq("user_id", userId).gte("log_date", startStr);

    const wc: Record<string, number> = {};
    (workouts || []).forEach((w) => { wc[w.log_date] = (wc[w.log_date] || 0) + 1; });
    const fc: Record<string, number> = {};
    (foods || []).forEach((f) => { fc[f.log_date] = (fc[f.log_date] || 0) + 1; });

    setDays((logs || []).map((l) => ({
      ...l, workout_count: wc[l.log_date] || 0, food_count: fc[l.log_date] || 0,
    })));
    setLoading(false);
  };

  const selectDay = async (day: DayData) => {
    setSelectedDay(selectedDay?.log_date === day.log_date ? null : day);
    if (!userId) return;
    const { data } = await supabase
      .from("workouts").select("*").eq("user_id", userId).eq("log_date", day.log_date).order("created_at");
    setDayWorkouts(data || []);
  };

  const fmt = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.rangeRow}>
        {[7, 14, 30].map((r) => (
          <TouchableOpacity key={r} style={[s.chip, range === r && s.chipActive]} onPress={() => { setRange(r); setSelectedDay(null); }}>
            <Text style={[s.chipText, range === r && s.chipTextActive]}>{r}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {days.length === 0 && <Text style={s.empty}>Nothing logged yet. You know what to do.</Text>}

      {days.map((day) => (
        <TouchableOpacity key={day.log_date} style={[s.dayCard, selectedDay?.log_date === day.log_date && s.dayCardActive]} onPress={() => selectDay(day)}>
          <View style={s.dayHeader}>
            <Text style={s.dayDate}>{fmt(day.log_date)}</Text>
            <View style={s.dots}>
              {day.workout_count > 0 && <View style={[s.dot, { backgroundColor: "#C0632A" }]} />}
              {day.food_count > 0 && <View style={[s.dot, { backgroundColor: "#E07840" }]} />}
              {day.stoic_reflection && <View style={[s.dot, { backgroundColor: "#F0EDE6" }]} />}
            </View>
          </View>
          <View style={s.dayStats}>
            {day.sleep_hours && <Text style={s.stat}>{day.sleep_hours}h sleep</Text>}
            {day.mood && <Text style={s.stat}>{MOODS[day.mood]}</Text>}
            {day.weight_lbs && <Text style={s.stat}>{day.weight_lbs} lbs</Text>}
            {day.workout_count > 0 && <Text style={s.stat}>{day.workout_count} workout{day.workout_count > 1 ? "s" : ""}</Text>}
          </View>

          {selectedDay?.log_date === day.log_date && (
            <View style={s.detail}>
              {dayWorkouts.map((w: any) => (
                <View key={w.id} style={s.wRow}>
                  <Text style={s.wType}>{w.is_f3 ? `F3 — ${w.f3_ao || "Workout"}` : w.workout_label || w.workout_type}</Text>
                  <Text style={s.wMeta}>{w.duration_minutes}min · RPE {w.rpe} · ~{w.estimated_calories_burned} cal</Text>
                </View>
              ))}
              {day.stoic_reflection && (
                <Text style={s.reflection}>"{day.stoic_reflection}"</Text>
              )}
              {dayWorkouts.length === 0 && !day.stoic_reflection && (
                <Text style={s.empty}>No workouts or reflections.</Text>
              )}
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: "#2E2D2A", borderWidth: 0.5, borderColor: "#5C5A54" },
  chipActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  chipText: { color: "#9C9A94", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#1C1C1A" },
  dayCard: { backgroundColor: "#2E2D2A", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: "#3D3C38" },
  dayCardActive: { borderColor: "#C0632A" },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayDate: { fontSize: 15, fontWeight: "700", color: "#F0EDE6" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dayStats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  stat: { fontSize: 13, color: "#9C9A94" },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#5C5A54" },
  wRow: { marginBottom: 8 },
  wType: { fontSize: 14, fontWeight: "600", color: "#F0EDE6" },
  wMeta: { fontSize: 12, color: "#9C9A94", marginTop: 2 },
  reflection: { fontSize: 14, color: "#F0EDE6", fontStyle: "italic", lineHeight: 22, marginTop: 8 },
});
