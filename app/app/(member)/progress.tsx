import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface Benchmark {
  id: string;
  name: string;
  unit: string;
  lower_is_better: boolean;
  category: string;
}

interface BenchmarkGroup {
  benchmark: Benchmark;
  results: any[];
  pr: number | null;
  trend: string;
}

export default function ProgressScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<{ date: string; weight_lbs: number }[]>([]);
  const [bodyPhotos, setBodyPhotos] = useState<{ date: string; url: string }[]>([]);
  const [goals, setGoals] = useState<any[]>([]);

  // Goal form
  const [showGoal, setShowGoal] = useState(false);
  const [goalDesc, setGoalDesc] = useState("");
  const [goalType, setGoalType] = useState("custom");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalUnit, setGoalUnit] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [groups, setGroups] = useState<BenchmarkGroup[]>([]);
  const [streak, setStreak] = useState(0);

  // Log result modal
  const [showLog, setShowLog] = useState(false);
  const [selectedBm, setSelectedBm] = useState<Benchmark | null>(null);
  const [resultVal, setResultVal] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) loadProgress();
  }, [userId]);

  const loadProgress = async () => {
    if (!userId) return;
    setLoading(true);

    // Weight trend (60 days)
    const sixtyAgo = new Date();
    sixtyAgo.setDate(sixtyAgo.getDate() - 60);
    const { data: wData } = await supabase
      .from("daily_logs")
      .select("log_date, weight_lbs")
      .eq("user_id", userId)
      .not("weight_lbs", "is", null)
      .gte("log_date", sixtyAgo.toISOString().split("T")[0])
      .order("log_date");
    setWeights((wData || []).map((w) => ({ date: w.log_date, weight_lbs: w.weight_lbs })));

    // Body photos (180 days)
    const oneEightyAgo = new Date();
    oneEightyAgo.setDate(oneEightyAgo.getDate() - 180);
    const { data: bpData } = await supabase
      .from("daily_logs")
      .select("log_date, body_photo_url")
      .eq("user_id", userId)
      .not("body_photo_url", "is", null)
      .gte("log_date", oneEightyAgo.toISOString().split("T")[0])
      .order("log_date", { ascending: false });
    setBodyPhotos((bpData || []).map((b) => ({ date: b.log_date, url: b.body_photo_url })));

    // Goals
    const { data: gData } = await supabase
      .from("member_goals").select("*")
      .eq("user_id", userId).eq("is_active", true)
      .order("created_at", { ascending: false });
    setGoals(gData || []);

    // Benchmarks
    const { data: bms } = await supabase
      .from("benchmarks").select("*").eq("is_active", true).order("category");
    setBenchmarks(bms || []);

    // My results
    const { data: results } = await supabase
      .from("benchmark_results")
      .select("*, benchmark:benchmarks(name, unit, lower_is_better, category)")
      .eq("user_id", userId)
      .order("log_date");

    const grouped: Record<string, BenchmarkGroup> = {};
    (results || []).forEach((r) => {
      const bm = r.benchmark;
      if (!grouped[r.benchmark_id]) {
        grouped[r.benchmark_id] = { benchmark: { ...bm, id: r.benchmark_id }, results: [], pr: null, trend: "unknown" };
      }
      grouped[r.benchmark_id].results.push(r);
    });

    Object.values(grouped).forEach((g) => {
      const lower = g.benchmark.lower_is_better;
      const best = lower
        ? Math.min(...g.results.map((r) => r.result_value))
        : Math.max(...g.results.map((r) => r.result_value));
      g.pr = best;
      if (g.results.length >= 2) {
        const first = g.results[0].result_value;
        const last = g.results[g.results.length - 1].result_value;
        g.trend = lower ? (last < first ? "improving" : "declining") : (last > first ? "improving" : "declining");
      }
    });
    setGroups(Object.values(grouped));

    // Streak
    const { data: workoutDates } = await supabase
      .from("workouts").select("log_date").eq("user_id", userId).order("log_date", { ascending: false }).limit(60);
    const dates = new Set((workoutDates || []).map((w) => w.log_date));
    let s = 0;
    const check = new Date();
    while (dates.has(check.toISOString().split("T")[0])) {
      s++;
      check.setDate(check.getDate() - 1);
    }
    setStreak(s);

    setLoading(false);
  };

  const logResult = async () => {
    if (!userId || !selectedBm || !resultVal) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    const val = parseFloat(resultVal);

    // Check PR
    const existing = groups.find((g) => g.benchmark.id === selectedBm.id);
    let isPr = !existing;
    if (existing && existing.pr !== null) {
      isPr = selectedBm.lower_is_better ? val < existing.pr : val > existing.pr;
    }

    await supabase.from("benchmark_results").insert({
      user_id: userId,
      benchmark_id: selectedBm.id,
      result_value: val,
      log_date: today,
      notes: resultNotes || null,
      is_pr: isPr,
    });

    if (isPr) Alert.alert("New PR", `${selectedBm.name}: ${val} ${selectedBm.unit}`);

    setShowLog(false);
    setResultVal("");
    setResultNotes("");
    setSelectedBm(null);
    setSaving(false);
    loadProgress();
  };

  const addGoal = async () => {
    if (!userId || !goalDesc.trim()) return;
    await supabase.from("member_goals").insert({
      user_id: userId,
      goal_type: goalType,
      description: goalDesc.trim(),
      target_value: goalTarget ? parseFloat(goalTarget) : null,
      target_unit: goalUnit.trim() || null,
      target_date: goalDate || null,
      is_active: true,
    });
    setShowGoal(false);
    setGoalDesc(""); setGoalType("custom"); setGoalTarget(""); setGoalUnit(""); setGoalDate("");
    loadProgress();
  };

  const markGoalAchieved = async (id: string) => {
    await supabase.from("member_goals").update({
      achieved_at: new Date().toISOString(),
      is_active: false,
    }).eq("id", id);
    loadProgress();
  };

  const deleteGoal = (id: string) => {
    Alert.alert("Delete goal?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await supabase.from("member_goals").update({ is_active: false }).eq("id", id);
        loadProgress();
      }},
    ]);
  };

  const formatUnit = (val: number, unit: string) => {
    if (unit === "time_seconds") {
      const m = Math.floor(val / 60);
      const sec = Math.round(val % 60);
      return `${m}:${sec.toString().padStart(2, "0")}`;
    }
    return `${val} ${unit}`;
  };

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  const wStart = weights.length > 0 ? weights[0].weight_lbs : null;
  const wCurrent = weights.length > 0 ? weights[weights.length - 1].weight_lbs : null;
  const wDelta = wStart && wCurrent ? (wCurrent - wStart).toFixed(1) : null;

  return (
    <ScrollView style={st.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Streak + Phase */}
      <View style={st.headerRow}>
        <View>
          <Text style={st.phaseLabel}>THE GRIND</Text>
          <Text style={st.streakText}>{streak} day streak</Text>
        </View>
        <View style={st.streakBadge}>
          <Ionicons name="flame" size={20} color="#C0632A" />
          <Text style={st.streakNum}>{streak}</Text>
        </View>
      </View>

      {/* Weight */}
      <View style={st.card}>
        <Text style={st.cardTitle}>Weight</Text>
        {weights.length >= 2 ? (
          <>
            <View style={st.weightRow}>
              <View style={st.weightStat}>
                <Text style={st.weightNum}>{wCurrent}</Text>
                <Text style={st.weightLabel}>CURRENT</Text>
              </View>
              <View style={st.weightStat}>
                <Text style={st.weightNum}>{wStart}</Text>
                <Text style={st.weightLabel}>START</Text>
              </View>
              <View style={st.weightStat}>
                <Text style={[st.weightNum, { color: parseFloat(wDelta!) < 0 ? "#C0632A" : "#F0EDE6" }]}>
                  {parseFloat(wDelta!) > 0 ? "+" : ""}{wDelta}
                </Text>
                <Text style={st.weightLabel}>DELTA</Text>
              </View>
            </View>
            {/* Sparkline using View bars */}
            <View style={st.sparkline}>
              {(() => {
                const max = Math.max(...weights.map(w => w.weight_lbs));
                const min = Math.min(...weights.map(w => w.weight_lbs));
                const range = max - min || 1;
                return weights.map((w, i) => {
                  const heightPct = ((w.weight_lbs - min) / range) * 100;
                  return (
                    <View key={i} style={st.sparkBarWrap}>
                      <View style={[st.sparkBar, { height: `${Math.max(heightPct, 5)}%` }]} />
                    </View>
                  );
                });
              })()}
            </View>
            <Text style={st.sparkLabel}>{weights.length} entries · last {Math.min(60, weights.length * 1)} days</Text>
          </>
        ) : (
          <Text style={st.muted}>Log weight on the Today screen to see trends.</Text>
        )}
      </View>

      {/* Body Photos Timeline */}
      {bodyPhotos.length > 0 && (
        <View style={st.card}>
          <Text style={st.cardTitle}>Body Progress</Text>
          <Text style={st.muted}>{bodyPhotos.length} photo{bodyPhotos.length > 1 ? "s" : ""} · only you can see these</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {bodyPhotos.map((p, i) => (
                <View key={i} style={st.photoTile}>
                  <Image source={{ uri: p.url }} style={st.photoImg} />
                  <Text style={st.photoDate}>{p.date}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Goals */}
      <View style={st.card}>
        <View style={st.cardRow}>
          <Text style={st.cardTitle}>Goals</Text>
          <TouchableOpacity onPress={() => setShowGoal(true)}>
            <Ionicons name="add-circle" size={24} color="#C0632A" />
          </TouchableOpacity>
        </View>
        {goals.length === 0 ? (
          <Text style={st.muted}>No active goals. Set what you're working toward.</Text>
        ) : (
          goals.map((g) => (
            <View key={g.id} style={st.goalRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.goalText}>{g.description}</Text>
                {g.target_value && <Text style={st.goalTarget}>Target: {g.target_value}{g.target_unit ? ` ${g.target_unit}` : ""}{g.target_date ? ` by ${g.target_date}` : ""}</Text>}
              </View>
              <TouchableOpacity onPress={() => markGoalAchieved(g.id)} style={st.goalDoneBtn}>
                <Ionicons name="checkmark" size={18} color="#C0632A" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteGoal(g.id)} style={st.goalDoneBtn}>
                <Ionicons name="close" size={18} color="#9C9A94" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Benchmarks */}
      <View style={st.card}>
        <View style={st.cardRow}>
          <Text style={st.cardTitle}>Benchmarks</Text>
          <TouchableOpacity onPress={() => setShowLog(true)}>
            <Ionicons name="add-circle" size={24} color="#C0632A" />
          </TouchableOpacity>
        </View>

        {groups.length === 0 && (
          <Text style={st.muted}>No benchmark results yet. Tap + to log one.</Text>
        )}

        {groups.map((g) => (
          <View key={g.benchmark.id} style={st.bmRow}>
            <View style={st.bmHeader}>
              <Text style={st.bmName}>{g.benchmark.name}</Text>
              {g.trend === "improving" && <Ionicons name="trending-up" size={16} color="#C0632A" />}
              {g.trend === "declining" && <Ionicons name="trending-down" size={16} color="#9C9A94" />}
            </View>
            <View style={st.bmStats}>
              <Text style={st.bmPr}>
                PR: {formatUnit(g.pr!, g.benchmark.unit)}
              </Text>
              <Text style={st.bmLast}>
                Last: {formatUnit(g.results[g.results.length - 1].result_value, g.benchmark.unit)}
              </Text>
              <Text style={st.bmCount}>{g.results.length} logged</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Log Result Modal */}
      <Modal visible={showLog} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <View style={st.cardRow}>
              <Text style={st.cardTitle}>Log Benchmark</Text>
              <TouchableOpacity onPress={() => setShowLog(false)}>
                <Ionicons name="close" size={24} color="#9C9A94" />
              </TouchableOpacity>
            </View>

            <Text style={st.label}>Benchmark</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={st.chipRow}>
                {benchmarks.map((bm) => (
                  <TouchableOpacity
                    key={bm.id}
                    style={[st.chip, selectedBm?.id === bm.id && st.chipActive]}
                    onPress={() => setSelectedBm(bm)}
                  >
                    <Text style={[st.chipText, selectedBm?.id === bm.id && st.chipTextActive]}>
                      {bm.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {selectedBm && (
              <>
                <Text style={st.label}>Result ({selectedBm.unit === "time_seconds" ? "seconds" : selectedBm.unit})</Text>
                <TextInput style={st.input} placeholder="0" placeholderTextColor="#5C5A54" value={resultVal} onChangeText={setResultVal} keyboardType="numeric" />
                <Text style={st.label}>Notes (optional)</Text>
                <TextInput style={st.input} placeholder="How did it feel?" placeholderTextColor="#5C5A54" value={resultNotes} onChangeText={setResultNotes} />
                <TouchableOpacity style={[st.cta, saving && { opacity: 0.6 }]} onPress={logResult} disabled={saving}>
                  {saving ? <ActivityIndicator color="#1C1C1A" /> : <Text style={st.ctaText}>Log Result</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Goal Modal */}
      <Modal visible={showGoal} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <View style={st.cardRow}>
              <Text style={st.cardTitle}>New Goal</Text>
              <TouchableOpacity onPress={() => setShowGoal(false)}>
                <Ionicons name="close" size={24} color="#9C9A94" />
              </TouchableOpacity>
            </View>

            <Text style={st.label}>What are you working toward?</Text>
            <TextInput style={st.input} placeholder="Lose 15 lbs / Run a 5K / Squat 315..." placeholderTextColor="#5C5A54" value={goalDesc} onChangeText={setGoalDesc} />

            <Text style={st.label}>Type</Text>
            <View style={st.chipRow}>
              {["weight", "benchmark", "consistency", "nutrition", "custom"].map((t) => (
                <TouchableOpacity key={t} style={[st.chip, goalType === t && st.chipActive]} onPress={() => setGoalType(t)}>
                  <Text style={[st.chipText, goalType === t && st.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>Target value</Text>
                <TextInput style={st.input} placeholder="0" placeholderTextColor="#5C5A54" value={goalTarget} onChangeText={setGoalTarget} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>Unit</Text>
                <TextInput style={st.input} placeholder="lbs / min / reps" placeholderTextColor="#5C5A54" value={goalUnit} onChangeText={setGoalUnit} />
              </View>
            </View>

            <Text style={st.label}>Target date (optional)</Text>
            <TextInput style={st.input} placeholder="YYYY-MM-DD" placeholderTextColor="#5C5A54" value={goalDate} onChangeText={setGoalDate} />

            <TouchableOpacity style={st.cta} onPress={addGoal}>
              <Text style={st.ctaText}>Save Goal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  phaseLabel: { fontSize: 11, fontWeight: "700", color: "#C0632A", letterSpacing: 2 },
  streakText: { fontSize: 14, color: "#9C9A94", marginTop: 2 },
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#2E2D2A", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  streakNum: { fontSize: 16, fontWeight: "800", color: "#C0632A" },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 0.5, borderColor: "#5C5A54" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#F0EDE6", marginBottom: 12 },
  sparkline: { flexDirection: "row", height: 60, alignItems: "flex-end", gap: 2, marginTop: 16 },
  sparkBarWrap: { flex: 1, height: "100%", justifyContent: "flex-end" },
  sparkBar: { backgroundColor: "#C0632A", borderRadius: 2 },
  sparkLabel: { fontSize: 11, color: "#5C5A54", marginTop: 8, textAlign: "center" },
  goalRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  goalText: { fontSize: 14, color: "#F0EDE6", fontWeight: "600" },
  goalTarget: { fontSize: 12, color: "#9C9A94", marginTop: 2 },
  goalDoneBtn: { padding: 6, marginLeft: 4 },
  photoTile: { width: 100, alignItems: "center" },
  photoImg: { width: 100, height: 130, borderRadius: 8, backgroundColor: "#1C1C1A" },
  photoDate: { fontSize: 11, color: "#9C9A94", marginTop: 4 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  weightRow: { flexDirection: "row", justifyContent: "space-around" },
  weightStat: { alignItems: "center" },
  weightNum: { fontSize: 22, fontWeight: "800", color: "#F0EDE6" },
  weightLabel: { fontSize: 11, fontWeight: "600", color: "#9C9A94", letterSpacing: 1.5, marginTop: 2 },
  muted: { color: "#5C5A54", fontSize: 14, fontStyle: "italic" },
  bmRow: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  bmHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bmName: { fontSize: 15, fontWeight: "600", color: "#F0EDE6" },
  bmStats: { flexDirection: "row", gap: 16, marginTop: 4 },
  bmPr: { fontSize: 13, color: "#C0632A", fontWeight: "600" },
  bmLast: { fontSize: 13, color: "#9C9A94" },
  bmCount: { fontSize: 13, color: "#5C5A54" },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54" },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54" },
  chipActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  chipText: { color: "#9C9A94", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#1C1C1A" },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#2E2D2A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "80%" },
});
