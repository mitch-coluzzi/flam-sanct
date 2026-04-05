import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";
import { decode } from "base64-arraybuffer";

interface DailyLog {
  id: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  mood: number | null;
  mood_note: string | null;
  weight_lbs: number | null;
  stoic_reflection: string | null;
  stoic_passage_id: string | null;
}

interface Workout {
  id: string;
  workout_type: string;
  workout_label: string | null;
  duration_minutes: number;
  rpe: number;
  estimated_calories_burned: number | null;
  is_f3: boolean;
  f3_ao: string | null;
}

const TODAY = new Date().toISOString().split("T")[0];

export default function TodayScreen() {
  const profile = useAuthStore((s) => s.profile);
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [log, setLog] = useState<DailyLog | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [caloriesIn, setCaloriesIn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkedIn, setCheckedIn] = useState(false);

  // Check-in fields
  const [sleepHours, setSleepHours] = useState("");
  const [sleepQuality, setSleepQuality] = useState(0);
  const [weight, setWeight] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [moodNote, setMoodNote] = useState("");

  // Workout modal
  const [showWorkout, setShowWorkout] = useState(false);
  const [wType, setWType] = useState("f3");
  const [wLabel, setWLabel] = useState("");
  const [wDuration, setWDuration] = useState("");
  const [wRpe, setWRpe] = useState(7);
  const [wIsF3, setWIsF3] = useState(true);
  const [wAo, setWAo] = useState("");
  const [wQ, setWQ] = useState("");
  const [wSaving, setWSaving] = useState(false);

  // Photo capture
  const [photoCapturing, setPhotoCapturing] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<any[]>([]);

  // Reflection
  const [reflection, setReflection] = useState("");
  const [passage, setPassage] = useState<any>(null);

  const userId = profile?.id;

  const loadToday = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Get or create daily log
    let { data: logData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", TODAY)
      .single();

    if (!logData) {
      const { data: newLog } = await supabase
        .from("daily_logs")
        .insert({ user_id: userId, log_date: TODAY })
        .select()
        .single();
      logData = newLog;
    }

    if (logData) {
      setLog(logData);
      setCheckedIn(!!(logData.sleep_hours || logData.mood));
      setReflection(logData.stoic_reflection || "");

      // Load passage if assigned
      if (logData.stoic_passage_id) {
        const { data: p } = await supabase
          .from("stoic_passages")
          .select("author, source, passage")
          .eq("id", logData.stoic_passage_id)
          .single();
        setPassage(p);
      }
    }

    // Workouts
    const { data: wData } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", TODAY)
      .order("created_at");
    setWorkouts(wData || []);

    // Food calories
    const { data: fData } = await supabase
      .from("food_logs")
      .select("calories")
      .eq("user_id", userId)
      .eq("log_date", TODAY);
    setCaloriesIn((fData || []).reduce((sum, f) => sum + (f.calories || 0), 0));

    // Pending photo captures
    const { data: pData } = await supabase
      .from("food_logs")
      .select("id, food_name, calories, photo_url, photo_capture_status, ai_portion_estimate")
      .eq("user_id", userId)
      .eq("log_date", TODAY)
      .eq("source", "photo_capture")
      .order("created_at", { ascending: false });
    setPendingPhotos(pData || []);

    setLoading(false);
  }, [userId]);

  useEffect(() => { loadToday(); }, [loadToday]);

  const captureFood = async (mealType: string) => {
    if (!userId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setPhotoCapturing(true);

    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() || "jpg";
    const path = `${userId}/${TODAY}_${mealType}_${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    if (asset.base64) {
      await supabase.storage.from("food-photos").upload(path, decode(asset.base64), {
        contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
      });
    }

    const photoUrl = `${supabase.supabaseUrl}/storage/v1/object/food-photos/${path}`;

    // Create food log with placeholder — Claude Vision estimation requires backend
    await supabase.from("food_logs").insert({
      user_id: userId,
      log_date: TODAY,
      meal_type: mealType,
      source: "photo_capture",
      food_name: "Photo capture — pending review",
      photo_url: photoUrl,
      photo_capture_status: "pending",
      ai_portion_estimate: null,
    });

    setPhotoCapturing(false);
    Alert.alert("Photo captured", "Your chef will review and confirm this shortly.");
    loadToday();
  };

  const submitCheckIn = async () => {
    if (!userId || !log) return;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (sleepHours) updates.sleep_hours = parseFloat(sleepHours);
    if (sleepQuality) updates.sleep_quality = sleepQuality;
    if (weight) updates.weight_lbs = parseFloat(weight);
    if (mood !== null) updates.mood = mood;
    if (moodNote) updates.mood_note = moodNote;

    await supabase.from("daily_logs").update(updates).eq("id", log.id);
    setCheckedIn(true);
    loadToday();
  };

  const submitWorkout = async () => {
    if (!userId) return;
    setWSaving(true);

    const MET: Record<string, number> = { f3: 8, strength: 5, cardio: 7, mobility: 3, other: 5 };
    const weightKg = (parseFloat(weight) || (log?.weight_lbs || 185)) * 0.453592;
    const dur = parseInt(wDuration) || 0;
    const met = MET[wType] || 5;
    const rpeMult = 0.7 + (wRpe / 10 * 0.6);
    const estCal = Math.round(met * weightKg * (dur / 60) * rpeMult);

    await supabase.from("workouts").insert({
      user_id: userId,
      log_date: TODAY,
      workout_type: wType,
      workout_label: wLabel || null,
      duration_minutes: dur,
      rpe: wRpe,
      estimated_calories_burned: estCal,
      is_f3: wIsF3,
      f3_ao: wIsF3 ? wAo || null : null,
      f3_q: wIsF3 ? wQ || null : null,
    });

    setShowWorkout(false);
    setWLabel(""); setWDuration(""); setWRpe(7); setWAo(""); setWQ("");
    setWSaving(false);
    loadToday();
  };

  const saveReflection = async () => {
    if (!log || !reflection.trim()) return;
    await supabase.from("daily_logs").update({
      stoic_reflection: reflection.trim(),
      updated_at: new Date().toISOString(),
    }).eq("id", log.id);
    Alert.alert("Saved.");
  };

  const caloriesOut = workouts.reduce((s, w) => s + (w.estimated_calories_burned || 0), 0);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#C0632A" />
      </View>
    );
  }

  const MOOD_SCALE: { value: number; label: string; color: string }[] = [
    { value: -4, label: "Crisis", color: "#6B4C5A" },
    { value: -3, label: "Struggling", color: "#7A5C5C" },
    { value: -2, label: "Low", color: "#8A6E5E" },
    { value: -1, label: "Flat", color: "#7A7A72" },
    { value: 0, label: "Neutral", color: "#5C5A54" },
    { value: 1, label: "Steady", color: "#7A6A4A" },
    { value: 2, label: "Solid", color: "#9A7A3A" },
    { value: 3, label: "Strong", color: "#B07030" },
    { value: 4, label: "Peak", color: "#C0632A" },
  ];
  const moodLabel = (v: number | null) => MOOD_SCALE.find((m) => m.value === v)?.label || "";
  const moodColor = (v: number | null) => MOOD_SCALE.find((m) => m.value === v)?.color || "#5C5A54";
  const SLEEP_Q = ["", "Terrible", "Poor", "Fair", "Good", "Excellent"];

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <Text style={s.date}>{todayLabel}</Text>
      <Text style={s.phase}>THE GRIND</Text>
      <Text style={s.greeting}>
        {profile?.display_name || profile?.full_name || "PAX"}
      </Text>

      {/* ── Check-In Card ── */}
      {!checkedIn ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Morning Check-In</Text>

          <Text style={s.label}>Sleep (hours)</Text>
          <TextInput
            style={s.input}
            placeholder="7.5"
            placeholderTextColor="#5C5A54"
            value={sleepHours}
            onChangeText={setSleepHours}
            keyboardType="numeric"
          />

          <Text style={s.label}>Sleep quality</Text>
          <View style={s.chipRow}>
            {[1, 2, 3, 4, 5].map((v) => (
              <TouchableOpacity
                key={v}
                style={[s.chip, sleepQuality === v && s.chipActive]}
                onPress={() => setSleepQuality(v)}
              >
                <Text style={[s.chipText, sleepQuality === v && s.chipTextActive]}>
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Weight ({profile?.weight_unit || "lbs"})</Text>
          <TextInput
            style={s.input}
            placeholder={log?.weight_lbs?.toString() || "0"}
            placeholderTextColor="#5C5A54"
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />

          <Text style={s.label}>Mood</Text>
          {mood !== null && (
            <Text style={[s.moodDisplay, { color: moodColor(mood) }]}>
              {moodLabel(mood)}
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {MOOD_SCALE.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.chip, mood === m.value && { backgroundColor: m.color, borderColor: m.color }]}
                  onPress={() => setMood(m.value)}
                >
                  <Text style={[s.chipText, mood === m.value && s.chipTextActive]}>
                    {m.value > 0 ? `+${m.value}` : m.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {mood !== null && mood <= -4 && (
            <View style={s.crisisCard}>
              <Text style={s.crisisText}>
                If you're in a tough spot, talking to someone helps. You don't have to carry it alone.
              </Text>
              <Text style={s.crisisLink}>988 Suicide & Crisis Lifeline: call or text 988</Text>
            </View>
          )}

          <TextInput
            style={[s.input, { marginTop: 8 }]}
            placeholder="Mood note (optional)"
            placeholderTextColor="#5C5A54"
            value={moodNote}
            onChangeText={setMoodNote}
          />

          <TouchableOpacity style={s.cta} onPress={submitCheckIn}>
            <Text style={s.ctaText}>Log Check-In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.card}>
          <View style={s.cardRow}>
            <Ionicons name="checkmark-circle" size={20} color="#C0632A" />
            <Text style={s.cardDone}>Checked in</Text>
          </View>
          {log?.sleep_hours && (
            <Text style={s.statLine}>
              Sleep: {log.sleep_hours}h · Quality: {SLEEP_Q[log.sleep_quality || 0]}
            </Text>
          )}
          {log?.mood !== null && log?.mood !== undefined && (
            <Text style={s.statLine}>Mood: {moodLabel(log.mood)}{log.mood_note ? ` — ${log.mood_note}` : ""}</Text>
          )}
          {log?.mood !== null && log?.mood !== undefined && log.mood <= -4 && (
            <View style={s.crisisCard}>
              <Text style={s.crisisText}>
                If you're in a tough spot, talking to someone helps. You don't have to carry it alone.
              </Text>
              <Text style={s.crisisLink}>988 Suicide & Crisis Lifeline: call or text 988</Text>
            </View>
          )}
          {log?.weight_lbs && (
            <Text style={s.statLine}>Weight: {log.weight_lbs} lbs</Text>
          )}
        </View>
      )}

      {/* ── Workouts ── */}
      <View style={s.card}>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>Workouts</Text>
          <TouchableOpacity onPress={() => setShowWorkout(true)}>
            <Ionicons name="add-circle" size={24} color="#C0632A" />
          </TouchableOpacity>
        </View>
        {workouts.length === 0 ? (
          <Text style={s.muted}>No workouts logged today.</Text>
        ) : (
          workouts.map((w) => (
            <View key={w.id} style={s.workoutRow}>
              <Text style={s.workoutType}>
                {w.is_f3 ? `F3 — ${w.f3_ao || "Workout"}` : w.workout_label || w.workout_type}
              </Text>
              <Text style={s.workoutMeta}>
                {w.duration_minutes}min · RPE {w.rpe} · ~{w.estimated_calories_burned} cal
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ── Food Summary ── */}
      <View style={s.card}>
        <View style={s.cardRow}>
          <Text style={s.cardTitle}>Nutrition</Text>
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Snap Food Photo", "Which meal?", [
                { text: "Breakfast", onPress: () => captureFood("breakfast") },
                { text: "Lunch", onPress: () => captureFood("lunch") },
                { text: "Dinner", onPress: () => captureFood("dinner") },
                { text: "Snack", onPress: () => captureFood("snack") },
                { text: "Cancel", style: "cancel" },
              ]);
            }}
            disabled={photoCapturing}
          >
            {photoCapturing ? (
              <ActivityIndicator size="small" color="#C0632A" />
            ) : (
              <Ionicons name="camera" size={22} color="#C0632A" />
            )}
          </TouchableOpacity>
        </View>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{caloriesIn}</Text>
            <Text style={s.statLabel}>IN</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{caloriesOut}</Text>
            <Text style={s.statLabel}>OUT</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statNum, { color: "#C0632A" }]}>{caloriesIn - caloriesOut}</Text>
            <Text style={s.statLabel}>NET</Text>
          </View>
        </View>

        {/* Pending photo captures */}
        {pendingPhotos.length > 0 && (
          <View style={s.pendingSection}>
            <Text style={s.pendingLabel}>
              {pendingPhotos.filter((p) => p.photo_capture_status === "pending").length} awaiting review
            </Text>
            {pendingPhotos.map((p) => (
              <View key={p.id} style={s.pendingRow}>
                <Ionicons
                  name={p.photo_capture_status === "pending" ? "time-outline" : "checkmark-circle"}
                  size={16}
                  color={p.photo_capture_status === "pending" ? "#9C9A94" : "#C0632A"}
                />
                <Text style={s.pendingFood}>{p.food_name}</Text>
                {p.calories && <Text style={s.pendingCal}>~{p.calories} cal</Text>}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Stoic Card ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Stoic Reflection</Text>
        {passage ? (
          <>
            <Text style={s.passage}>"{passage.passage}"</Text>
            <Text style={s.attribution}>
              — {passage.author}{passage.source ? `, ${passage.source}` : ""}
            </Text>
          </>
        ) : (
          <Text style={s.muted}>No passage assigned today.</Text>
        )}
        <TextInput
          style={[s.input, { marginTop: 16, minHeight: 80, textAlignVertical: "top" }]}
          placeholder="What does this mean for you today?"
          placeholderTextColor="#5C5A54"
          value={reflection}
          onChangeText={setReflection}
          multiline
        />
        <TouchableOpacity style={s.ctaSmall} onPress={saveReflection}>
          <Text style={s.ctaText}>Save Reflection</Text>
        </TouchableOpacity>
      </View>

      {/* ── Workout Modal ── */}
      <Modal visible={showWorkout} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.cardRow}>
              <Text style={s.cardTitle}>Log Workout</Text>
              <TouchableOpacity onPress={() => setShowWorkout(false)}>
                <Ionicons name="close" size={24} color="#9C9A94" />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Type</Text>
            <View style={s.chipRow}>
              {["f3", "strength", "cardio", "mobility", "other"].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.chip, wType === t && s.chipActive]}
                  onPress={() => { setWType(t); setWIsF3(t === "f3"); }}
                >
                  <Text style={[s.chipText, wType === t && s.chipTextActive]}>
                    {t === "f3" ? "F3" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {wIsF3 && (
              <>
                <TextInput style={s.input} placeholder="AO (location)" placeholderTextColor="#5C5A54" value={wAo} onChangeText={setWAo} />
                <TextInput style={s.input} placeholder="Q (leader)" placeholderTextColor="#5C5A54" value={wQ} onChangeText={setWQ} />
              </>
            )}
            {!wIsF3 && (
              <TextInput style={s.input} placeholder="Label (optional)" placeholderTextColor="#5C5A54" value={wLabel} onChangeText={setWLabel} />
            )}

            <Text style={s.label}>Duration (minutes)</Text>
            <TextInput style={s.input} placeholder="45" placeholderTextColor="#5C5A54" value={wDuration} onChangeText={setWDuration} keyboardType="numeric" />

            <Text style={s.label}>RPE (1-10): {wRpe}</Text>
            <View style={s.chipRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[s.chipSmall, wRpe === v && s.chipActive]}
                  onPress={() => setWRpe(v)}
                >
                  <Text style={[s.chipText, wRpe === v && s.chipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.cta, wSaving && { opacity: 0.6 }]}
              onPress={submitWorkout}
              disabled={wSaving}
            >
              {wSaving ? <ActivityIndicator color="#1C1C1A" /> : <Text style={s.ctaText}>Log Workout</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  date: { fontSize: 13, color: "#9C9A94", fontFamily: "System" },
  phase: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C0632A",
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: 12,
  },
  greeting: { fontSize: 26, fontWeight: "800", color: "#F0EDE6", marginBottom: 20 },
  card: {
    backgroundColor: "#2E2D2A",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: "#5C5A54",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#F0EDE6", marginBottom: 12 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardDone: { fontSize: 14, fontWeight: "600", color: "#C0632A", marginLeft: 8 },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    backgroundColor: "#1C1C1A",
    color: "#F0EDE6",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 0.5,
    borderColor: "#5C5A54",
    marginBottom: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#1C1C1A",
    borderWidth: 0.5,
    borderColor: "#5C5A54",
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#1C1C1A",
    borderWidth: 0.5,
    borderColor: "#5C5A54",
  },
  chipActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  chipText: { color: "#9C9A94", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#1C1C1A" },
  cta: {
    backgroundColor: "#C0632A",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  ctaSmall: {
    backgroundColor: "#C0632A",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginTop: 12,
  },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  muted: { color: "#5C5A54", fontSize: 14, fontStyle: "italic" },
  statLine: { color: "#9C9A94", fontSize: 14, marginTop: 4 },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "800", color: "#F0EDE6" },
  statLabel: { fontSize: 11, fontWeight: "600", color: "#9C9A94", letterSpacing: 1.5, marginTop: 2 },
  workoutRow: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  workoutType: { fontSize: 15, fontWeight: "600", color: "#F0EDE6" },
  workoutMeta: { fontSize: 13, color: "#9C9A94", marginTop: 2 },
  moodDisplay: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  crisisCard: {
    backgroundColor: "#3D2A2A",
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: "#6B4C5A",
  },
  crisisText: { fontSize: 14, color: "#F0EDE6", lineHeight: 20 },
  crisisLink: { fontSize: 13, color: "#C0632A", fontWeight: "600", marginTop: 8 },
  passage: { fontSize: 16, color: "#F0EDE6", fontStyle: "italic", lineHeight: 24 },
  attribution: { fontSize: 13, color: "#9C9A94", marginTop: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#2E2D2A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "85%",
  },
  pendingSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  pendingLabel: { fontSize: 12, fontWeight: "600", color: "#9C9A94", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  pendingFood: { fontSize: 14, color: "#F0EDE6", flex: 1 },
  pendingCal: { fontSize: 13, color: "#9C9A94" },
});
