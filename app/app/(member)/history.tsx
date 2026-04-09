import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface DayLog {
  id: string;
  log_date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  mood: number | null;
  mood_note: string | null;
  evening_mood: number | null;
  weight_lbs: number | null;
  am_reflection: string | null;
  pm_reflection: string | null;
  stoic_reflection: string | null;
  journal_note: string | null;
  abstain_hit: boolean | null;
  growth_hit: boolean | null;
  life_event: string | null;
  life_event_note: string | null;
  grade_body: number | null;
  grade_emotion: number | null;
  grade_spiritual: number | null;
  grade_relational: number | null;
  grade_financial: number | null;
  anomaly_flagged: boolean | null;
  anomaly_note: string | null;
}

interface DayData extends DayLog {
  workout_count: number;
  food_count: number;
}

const MOOD_LABELS: Record<number, string> = {
  [-4]: "Crisis", [-3]: "Struggling", [-2]: "Low", [-1]: "Flat",
  [0]: "Neutral", [1]: "Steady", [2]: "Solid", [3]: "Strong", [4]: "Peak",
};
const SLEEP_Q: Record<number, string> = { [-2]: "Terrible", [-1]: "Poor", [0]: "OK", [1]: "Good", [2]: "Great" };
const GRADE_LABELS: Record<number, string> = { [-2]: "Struggling", [-1]: "Below", [0]: "Neutral", [1]: "Above", [2]: "Thriving" };
const moodLabel = (v: number | null) => v !== null ? MOOD_LABELS[v] || "" : "";

export default function HistoryScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [dayWorkouts, setDayWorkouts] = useState<any[]>([]);
  const [dayFoods, setDayFoods] = useState<any[]>([]);
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
      .select("id, log_date, sleep_hours, sleep_quality, mood, mood_note, evening_mood, weight_lbs, am_reflection, pm_reflection, stoic_reflection, journal_note, abstain_hit, growth_hit, life_event, life_event_note, grade_body, grade_emotion, grade_spiritual, grade_relational, grade_financial, anomaly_flagged, anomaly_note")
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

    setDays((logs || []).map((l: any) => ({
      ...l, workout_count: wc[l.log_date] || 0, food_count: fc[l.log_date] || 0,
    })));
    setLoading(false);
  };

  const selectDay = async (day: DayData) => {
    if (selectedDay?.log_date === day.log_date) {
      setSelectedDay(null);
      return;
    }
    setSelectedDay(day);
    if (!userId) return;
    const [{ data: w }, { data: f }] = await Promise.all([
      supabase.from("workouts").select("*").eq("user_id", userId).eq("log_date", day.log_date).order("created_at"),
      supabase.from("food_logs").select("id, food_name, meal_type, calories, protein_g, carbs_g, fat_g, source, photo_capture_status").eq("user_id", userId).eq("log_date", day.log_date).order("created_at"),
    ]);
    setDayWorkouts(w || []);
    setDayFoods(f || []);
  };

  const fmt = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const gradeRow = (label: string, val: number | null) => {
    if (val === null) return null;
    return (
      <View style={s.gradeItem} key={label}>
        <Text style={s.gradeLabel}>{label}</Text>
        <Text style={[s.gradeVal, val > 0 && { color: "#5A7A6A" }, val < 0 && { color: "#9A5A5A" }]}>{GRADE_LABELS[val] || val}</Text>
      </View>
    );
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

      {days.map((day) => {
        const isSelected = selectedDay?.log_date === day.log_date;
        return (
          <TouchableOpacity key={day.log_date} style={[s.dayCard, isSelected && s.dayCardActive]} onPress={() => selectDay(day)}>
            <View style={s.dayHeader}>
              <Text style={s.dayDate}>{fmt(day.log_date)}</Text>
              <View style={s.dots}>
                {day.workout_count > 0 && <View style={[s.dot, { backgroundColor: "#C0632A" }]} />}
                {day.food_count > 0 && <View style={[s.dot, { backgroundColor: "#E07840" }]} />}
                {day.stoic_reflection && <View style={[s.dot, { backgroundColor: "#F0EDE6" }]} />}
                {day.anomaly_flagged && <View style={[s.dot, { backgroundColor: "#9A5A5A" }]} />}
              </View>
            </View>
            <View style={s.dayStats}>
              {day.sleep_hours != null && <Text style={s.stat}>{day.sleep_hours}h sleep</Text>}
              {day.mood !== null && <Text style={s.stat}>{moodLabel(day.mood)}</Text>}
              {day.weight_lbs != null && <Text style={s.stat}>{day.weight_lbs} lbs</Text>}
              {day.workout_count > 0 && <Text style={s.stat}>{day.workout_count} workout{day.workout_count > 1 ? "s" : ""}</Text>}
              {day.food_count > 0 && <Text style={s.stat}>{day.food_count} food{day.food_count > 1 ? "s" : ""}</Text>}
            </View>

            {isSelected && (
              <View style={s.detail}>
                {/* Recovery */}
                {(day.sleep_hours != null || day.sleep_quality !== null) && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>RECOVERY</Text>
                    <View style={s.detailRow}>
                      {day.sleep_hours != null && <Text style={s.detailText}>Sleep: {day.sleep_hours}h</Text>}
                      {day.sleep_quality !== null && <Text style={s.detailText}>Quality: {SLEEP_Q[day.sleep_quality] || day.sleep_quality}</Text>}
                    </View>
                  </View>
                )}

                {/* Mood */}
                {(day.mood !== null || day.evening_mood !== null) && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>MOOD</Text>
                    <View style={s.detailRow}>
                      {day.mood !== null && <Text style={s.detailText}>AM: {moodLabel(day.mood)}</Text>}
                      {day.evening_mood !== null && <Text style={s.detailText}>PM: {moodLabel(day.evening_mood)}</Text>}
                    </View>
                    {day.mood_note && <Text style={s.noteText}>{day.mood_note}</Text>}
                  </View>
                )}

                {/* Reflections */}
                {(day.am_reflection || day.pm_reflection) && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>REFLECTIONS</Text>
                    {day.am_reflection && (
                      <View style={{ marginBottom: 6 }}>
                        <Text style={s.reflectionLabel}>AM</Text>
                        <Text style={s.reflection}>"{day.am_reflection}"</Text>
                      </View>
                    )}
                    {day.pm_reflection && (
                      <View>
                        <Text style={s.reflectionLabel}>PM</Text>
                        <Text style={s.reflection}>"{day.pm_reflection}"</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Stoic reflection */}
                {day.stoic_reflection && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>STOIC REFLECTION</Text>
                    <Text style={s.reflection}>"{day.stoic_reflection}"</Text>
                  </View>
                )}

                {/* Workouts */}
                {dayWorkouts.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>WORKOUTS</Text>
                    {dayWorkouts.map((w: any) => (
                      <View key={w.id} style={s.wRow}>
                        <Text style={s.wType}>{w.is_f3 ? `F3 — ${w.f3_ao || "Workout"}` : w.workout_label || w.workout_type}</Text>
                        <Text style={s.wMeta}>{w.duration_minutes}min · RPE {w.rpe} · ~{w.estimated_calories_burned} cal</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Food */}
                {dayFoods.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>NUTRITION</Text>
                    {dayFoods.map((f: any) => (
                      <View key={f.id} style={s.foodRow}>
                        <View style={s.foodHeader}>
                          <Text style={s.foodName}>{f.food_name || "Unnamed"}</Text>
                          <Text style={s.foodMeal}>{f.meal_type}</Text>
                        </View>
                        <Text style={s.foodMacros}>
                          {f.calories ? `${f.calories} cal` : "—"}
                          {f.protein_g ? ` · ${f.protein_g}P` : ""}
                          {f.carbs_g ? ` · ${f.carbs_g}C` : ""}
                          {f.fat_g ? ` · ${f.fat_g}F` : ""}
                          {f.source === "photo_capture" ? ` · 📷 ${f.photo_capture_status}` : ""}
                        </Text>
                      </View>
                    ))}
                    <View style={s.foodTotals}>
                      <Text style={s.totalText}>
                        Total: {dayFoods.reduce((sum: number, f: any) => sum + (f.calories || 0), 0)} cal
                        {" · "}{dayFoods.reduce((sum: number, f: any) => sum + (f.protein_g || 0), 0)}P
                        {" · "}{dayFoods.reduce((sum: number, f: any) => sum + (f.carbs_g || 0), 0)}C
                        {" · "}{dayFoods.reduce((sum: number, f: any) => sum + (f.fat_g || 0), 0)}F
                      </Text>
                    </View>
                  </View>
                )}

                {/* Trackers */}
                {(day.abstain_hit !== null || day.growth_hit !== null) && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>TRACKERS</Text>
                    <View style={s.detailRow}>
                      {day.abstain_hit !== null && (
                        <Text style={s.detailText}>
                          {profile?.abstain_label || "Abstain"}: {day.abstain_hit ? "✓" : "✗"}
                        </Text>
                      )}
                      {day.growth_hit !== null && (
                        <Text style={s.detailText}>
                          {profile?.growth_label || "Growth"}: {day.growth_hit ? "✓" : "✗"}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Life Grades */}
                {(day.grade_body !== null || day.grade_emotion !== null || day.grade_spiritual !== null || day.grade_relational !== null || day.grade_financial !== null) && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>LIFE GRADES</Text>
                    <View style={s.gradeRow}>
                      {gradeRow("Body", day.grade_body)}
                      {gradeRow("Mind", day.grade_emotion)}
                      {gradeRow("Spirit", day.grade_spiritual)}
                      {gradeRow("Relation", day.grade_relational)}
                      {gradeRow("Finance", day.grade_financial)}
                    </View>
                  </View>
                )}

                {/* Life Event */}
                {day.life_event && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>LIFE EVENT</Text>
                    <Text style={s.detailText}>{day.life_event}</Text>
                    {day.life_event_note && <Text style={s.noteText}>{day.life_event_note}</Text>}
                  </View>
                )}

                {/* Journal */}
                {day.journal_note && (
                  <View style={s.section}>
                    <Text style={s.sectionLabel}>JOURNAL</Text>
                    <Text style={s.reflection}>"{day.journal_note}"</Text>
                  </View>
                )}

                {/* Anomaly */}
                {day.anomaly_flagged && day.anomaly_note && (
                  <View style={[s.section, { backgroundColor: "#2A1F1F", borderRadius: 8, padding: 10 }]}>
                    <Text style={[s.sectionLabel, { color: "#9A5A5A" }]}>ANOMALY FLAGGED</Text>
                    <Text style={s.detailText}>{day.anomaly_note}</Text>
                  </View>
                )}

                {dayWorkouts.length === 0 && dayFoods.length === 0 && !day.am_reflection && !day.pm_reflection && !day.stoic_reflection && !day.journal_note && (
                  <Text style={s.empty}>No detail logged.</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
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
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: "#5C5A54", letterSpacing: 1.5, marginBottom: 6 },
  detailRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  detailText: { fontSize: 14, color: "#F0EDE6" },
  noteText: { fontSize: 13, color: "#9C9A94", fontStyle: "italic", marginTop: 4 },
  reflectionLabel: { fontSize: 11, fontWeight: "600", color: "#9C9A94", marginBottom: 2 },
  reflection: { fontSize: 14, color: "#F0EDE6", fontStyle: "italic", lineHeight: 22 },
  wRow: { marginBottom: 8 },
  wType: { fontSize: 14, fontWeight: "600", color: "#F0EDE6" },
  wMeta: { fontSize: 12, color: "#9C9A94", marginTop: 2 },
  foodRow: { marginBottom: 8 },
  foodHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  foodName: { fontSize: 14, fontWeight: "600", color: "#F0EDE6", flex: 1 },
  foodMeal: { fontSize: 11, color: "#9C9A94", textTransform: "uppercase", fontWeight: "600" },
  foodMacros: { fontSize: 12, color: "#9C9A94", marginTop: 2 },
  foodTotals: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  totalText: { fontSize: 13, fontWeight: "700", color: "#C0632A" },
  gradeRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gradeItem: { alignItems: "center", minWidth: 56 },
  gradeLabel: { fontSize: 10, color: "#5C5A54", fontWeight: "600", marginBottom: 2 },
  gradeVal: { fontSize: 13, color: "#F0EDE6", fontWeight: "600" },
});
