import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";
import { decode } from "base64-arraybuffer";

const TODAY = new Date().toISOString().split("T")[0];

const MOOD_SCALE = [
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
const SLEEP_Q: Record<number, string> = { [-2]: "Terrible", [-1]: "Poor", [0]: "Average", [1]: "Good", [2]: "Excellent" };

const RPE_LABELS: Record<number, string> = {
  1: "Rest", 2: "Easy", 3: "Light", 4: "Moderate", 5: "Challenging",
  6: "Hard", 7: "Very Hard", 8: "Intense", 9: "All Out", 10: "Max",
};

const DSM_AOS = [
  "House of Mayhem", "A New Hope", "Capitol Punishment", "Simon & Garfunkel",
  "Laurid Zeppelin", "Warriors Den", "The Proving Grounds", "MIT", "Pop-Up",
];

export default function TodayScreen() {
  const profile = useAuthStore((s) => s.profile);
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const userId = profile?.id;

  const [log, setLog] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [caloriesIn, setCaloriesIn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkedIn, setCheckedIn] = useState(false);

  // Check-in
  const [sleepHours, setSleepHours] = useState("");
  const [sleepQuality, setSleepQuality] = useState(0);
  const [weight, setWeight] = useState("");
  const [showWeight, setShowWeight] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [moodNote, setMoodNote] = useState("");
  const [abstainHit, setAbstainHit] = useState<boolean | null>(null);
  const [growthHit, setGrowthHit] = useState<boolean | null>(null);

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

  // Food response modal
  const [showFoodResponse, setShowFoodResponse] = useState(false);
  const [frMeal, setFrMeal] = useState("breakfast");
  const [frGut, setFrGut] = useState("");
  const [frEnergy, setFrEnergy] = useState("");
  const [frNote, setFrNote] = useState("");

  // Photo + pending
  const [photoCapturing, setPhotoCapturing] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<any[]>([]);

  // Stoic
  const [reflection, setReflection] = useState("");
  const [passage, setPassage] = useState<any>(null);

  const loadToday = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Get or create daily log
    let { data: logData } = await supabase.from("daily_logs").select("*").eq("user_id", userId).eq("log_date", TODAY).single();
    if (!logData) {
      const { data: newLog } = await supabase.from("daily_logs").insert({ user_id: userId, log_date: TODAY }).select().single();
      logData = newLog;
    }

    if (logData) {
      setLog(logData);
      setCheckedIn(!!(logData.sleep_hours || logData.mood !== null));
      setReflection(logData.stoic_reflection || "");

      // Stoic passage — assigned or fallback to random
      let p = null;
      if (logData.stoic_passage_id) {
        const { data } = await supabase.from("stoic_passages").select("id, author, source, passage").eq("id", logData.stoic_passage_id).single();
        p = data;
      }
      if (!p) {
        // Fallback: random active passage
        const { data: fallback } = await supabase.from("stoic_passages").select("id, author, source, passage").eq("is_active", true).limit(1);
        if (fallback && fallback.length > 0) {
          p = fallback[Math.floor(Math.random() * fallback.length)];
          // Assign to today's log
          await supabase.from("daily_logs").update({ stoic_passage_id: p.id }).eq("id", logData.id);
        }
      }
      setPassage(p);
    }

    // Weekly weight check
    const lastWeigh = (profile as any)?.last_weigh_date;
    const daysSinceWeigh = lastWeigh ? Math.floor((Date.now() - new Date(lastWeigh).getTime()) / 86400000) : 999;
    setShowWeight(daysSinceWeigh >= 7);

    // Workouts
    const { data: wData } = await supabase.from("workouts").select("*").eq("user_id", userId).eq("log_date", TODAY).order("created_at");
    setWorkouts(wData || []);

    // Food calories
    const { data: fData } = await supabase.from("food_logs").select("calories").eq("user_id", userId).eq("log_date", TODAY);
    setCaloriesIn((fData || []).reduce((sum: number, f: any) => sum + (f.calories || 0), 0));

    // Pending photos
    const { data: pData } = await supabase.from("food_logs").select("id, food_name, calories, photo_capture_status, ai_portion_estimate").eq("user_id", userId).eq("log_date", TODAY).eq("source", "photo_capture").order("created_at", { ascending: false });
    setPendingPhotos(pData || []);

    setLoading(false);
  }, [userId]);

  useEffect(() => { loadToday(); }, [loadToday]);

  // ── Submit handlers ──

  const submitCheckIn = async () => {
    if (!userId || !log) return;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (sleepHours) updates.sleep_hours = parseFloat(sleepHours);
    if (sleepQuality) updates.sleep_quality = sleepQuality;
    if (mood !== null) updates.mood = mood;
    if (moodNote) updates.mood_note = moodNote;
    if (abstainHit !== null) updates.abstain_hit = abstainHit;
    if (growthHit !== null) updates.growth_hit = growthHit;

    // Weekly weight
    if (weight) {
      updates.weight_lbs = parseFloat(weight);
      await supabase.from("users").update({ last_weigh_date: TODAY }).eq("id", userId);
    }

    await supabase.from("daily_logs").update(updates).eq("id", log.id);
    setCheckedIn(true);
    loadToday();
  };

  const submitWorkout = async () => {
    if (!userId) return;
    setWSaving(true);
    const MET: Record<string, number> = { f3: 8, strength: 5, cardio: 7, mobility: 3, other: 5 };
    const w_lbs = parseFloat(weight) || log?.weight_lbs || 185;
    const dur = parseInt(wDuration) || 0;
    const rpeMult = 0.7 + (wRpe / 10 * 0.6);
    const estCal = Math.round((MET[wType] || 5) * (w_lbs * 0.453592) * (dur / 60) * rpeMult);

    await supabase.from("workouts").insert({
      user_id: userId, log_date: TODAY, workout_type: wType,
      workout_label: wIsF3 ? `F3 — ${wAo || "Workout"}` : wLabel || null,
      duration_minutes: dur, rpe: wRpe, estimated_calories_burned: estCal,
      is_f3: wIsF3, f3_ao: wIsF3 ? wAo || null : null, f3_q: wIsF3 ? wQ || null : null,
    });
    setShowWorkout(false);
    setWLabel(""); setWDuration(""); setWRpe(7); setWAo(""); setWQ("");
    setWSaving(false);
    loadToday();
  };

  const captureFood = async (mealType: string) => {
    if (!userId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera permission required"); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotoCapturing(true);
    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() || "jpg";
    const path = `${userId}/${TODAY}_${mealType}_${Date.now()}.${ext}`;
    if (asset.base64) {
      await supabase.storage.from("food-photos").upload(path, decode(asset.base64), { contentType: `image/${ext === "png" ? "png" : "jpeg"}` });
    }
    await supabase.from("food_logs").insert({
      user_id: userId, log_date: TODAY, meal_type: mealType, source: "photo_capture",
      food_name: "Photo capture — pending review", photo_url: `${supabase.supabaseUrl}/storage/v1/object/food-photos/${path}`,
      photo_capture_status: "pending",
    });
    setPhotoCapturing(false);
    Alert.alert("Photo captured", "Your chef will review and confirm this shortly.");
    loadToday();
  };

  const submitFoodResponse = async () => {
    if (!userId) return;
    await supabase.from("food_responses").insert({
      user_id: userId, log_date: TODAY, meal_type: frMeal,
      gut_response: frGut || null, energy_response: frEnergy || null,
      note: frNote.trim() || null, symptom_at: new Date().toISOString(),
    });
    setShowFoodResponse(false);
    setFrGut(""); setFrEnergy(""); setFrNote("");
    Alert.alert("Logged.");
  };

  const saveReflection = async () => {
    if (!log || !reflection.trim()) return;
    await supabase.from("daily_logs").update({ stoic_reflection: reflection.trim(), updated_at: new Date().toISOString() }).eq("id", log.id);
    Alert.alert("Saved.");
  };

  const syncF3 = async () => {
    if (!userId || !profile?.f3_name) return;
    Alert.alert("Syncing F3...", "Pulling your attendance from F3 Nation.");
    try {
      const hdrs = { Authorization: "Bearer f3_da4d22544cb46c310a473020cd3bb9197d89ac62323f2453", Client: "flamsanct" };
      const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const evResp = await fetch(`https://api.f3nation.com/v1/event-instance?regionOrgId=36348&startDate=${startDate}&endDate=${TODAY}&pageSize=50`, { headers: hdrs });
      const evJson = await evResp.json();
      const events = Array.isArray(evJson) ? evJson : evJson?.eventInstances || evJson?.data || [];
      const locResp = await fetch("https://api.f3nation.com/v1/location?regionIds=36348&statuses=active&pageSize=50", { headers: hdrs });
      const locJson = await locResp.json();
      const locs = Array.isArray(locJson) ? locJson : locJson?.locations || locJson?.data || [];
      const aoMap: Record<string, string> = {};
      locs.forEach((l: any) => { if (l.id) aoMap[String(l.id)] = l.locationName?.replace(/F3 Des Moines[- ]*/i, "").trim() || "Unknown"; });
      let synced = 0;
      const f3Lower = profile.f3_name.toLowerCase();
      for (const e of events) {
        if (!e.id || !e.startDate || e.startDate > TODAY) continue;
        // Try actual first, then planned (HC)
        for (const planned of [false, true]) {
          const attResp = await fetch(`https://api.f3nation.com/v1/attendance/event-instance/${e.id}?isPlanned=${planned}`, { headers: hdrs });
          const attJson = await attResp.json();
          const recs = Array.isArray(attJson) ? attJson : attJson?.attendance || [];
          const match = recs.find((r: any) => (r.user?.f3Name || r.user?.name || "").replace(/F3 Des Moines[- ]*/i, "").trim().toLowerCase() === f3Lower);
          if (!match) continue;
          const aoName = aoMap[String(e.locationId || e.orgId || "")] || "F3 Workout";
          const { data: ex } = await supabase.from("workouts").select("id").eq("user_id", userId).eq("log_date", e.startDate).eq("f3_ao", aoName).limit(1);
          if (ex && ex.length > 0) break;
          const wKg = (log?.weight_lbs || 185) * 0.453592;
          const estCal = Math.round(8.0 * wKg * (45 / 60) * (0.7 + (7 / 10 * 0.6)));
          const attTypes = match.attendanceTypes || [];
          const isQ = attTypes.some((a: any) => a.type === "Q");
          let qName = null;
          if (!isQ) { const qr = recs.find((r: any) => (r.attendanceTypes || []).some((a: any) => a.type === "Q")); if (qr) qName = (qr.user?.f3Name || "").replace(/F3 Des Moines[- ]*/i, "").trim(); }
          await supabase.from("workouts").insert({ user_id: userId, log_date: e.startDate, workout_type: "f3", workout_label: `F3 — ${aoName}`, duration_minutes: 45, rpe: 7, estimated_calories_burned: estCal, is_f3: true, f3_ao: aoName, f3_q: isQ ? profile.f3_name : qName, notes: "Auto-synced from F3 Nation" });
          const { data: dl } = await supabase.from("daily_logs").select("id").eq("user_id", userId).eq("log_date", e.startDate).limit(1);
          if (!dl || dl.length === 0) await supabase.from("daily_logs").insert({ user_id: userId, log_date: e.startDate });
          synced++; break;
        }
      }
      Alert.alert("F3 Sync", `${synced} workout${synced !== 1 ? "s" : ""} synced.`);
      loadToday();
    } catch { Alert.alert("Sync failed", "Couldn't reach F3 Nation API."); }
  };

  const caloriesOut = workouts.reduce((s: number, w: any) => s + (w.estimated_calories_burned || 0), 0);

  if (loading) return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#C0632A" /></View>;

  return (
    <ScrollView style={st.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={st.date}>{todayLabel}</Text>
      <Text style={st.phase}>THE GRIND</Text>
      <Text style={st.greeting}>{profile?.display_name || profile?.full_name || "PAX"}</Text>

      {/* ── CHECK-IN ── */}
      {!checkedIn ? (
        <View style={st.card}>
          <Text style={st.cardTitle}>Morning Check-In</Text>

          <Text style={st.label}>Sleep</Text>
          <View style={st.sleepRow}>
            <TextInput style={[st.input, { flex: 1, marginBottom: 0 }]} placeholder="7.5" placeholderTextColor="#5C5A54" value={sleepHours} onChangeText={setSleepHours} keyboardType="numeric" />
            <Text style={st.sleepUnit}>hrs</Text>
            <View style={st.sqRow}>
              {([-2, -1, 0, 1, 2] as const).map((v) => (
                <TouchableOpacity key={v} style={[st.sqChip, sleepQuality === v && st.sqActive]} onPress={() => setSleepQuality(v)}>
                  <Text style={[st.sqText, sleepQuality === v && st.activeText]}>{v > 0 ? `+${v}` : v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Weekly weight */}
          {showWeight && (
            <>
              <Text style={st.label}>Weight ({profile?.weight_unit || "lbs"}) <Text style={st.weightReminder}>· weekly check-in</Text></Text>
              <TextInput style={st.input} placeholder={log?.weight_lbs?.toString() || "0"} placeholderTextColor="#5C5A54" value={weight} onChangeText={setWeight} keyboardType="numeric" />
            </>
          )}

          <Text style={st.label}>Mood</Text>
          {mood !== null && <Text style={[st.moodDisplay, { color: moodColor(mood) }]}>{moodLabel(mood)}</Text>}
          <View style={st.moodRow}>
            {MOOD_SCALE.map((m) => (
              <TouchableOpacity key={m.value} style={[st.moodChip, mood === m.value && { backgroundColor: m.color, borderColor: m.color }]} onPress={() => setMood(m.value)}>
                <Text style={[st.moodChipText, mood === m.value && st.activeText]}>{m.value > 0 ? `+${m.value}` : m.value}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {mood !== null && mood <= -4 && (
            <View style={st.crisisCard}>
              <Text style={st.crisisText}>If you're in a tough spot, talking to someone helps. You don't have to carry it alone.</Text>
              <Text style={st.crisisLink}>988 Suicide & Crisis Lifeline: call or text 988</Text>
            </View>
          )}
          <TextInput style={[st.input, { marginTop: 8 }]} placeholder="Mood note (optional)" placeholderTextColor="#5C5A54" value={moodNote} onChangeText={setMoodNote} />

          {/* Abstain + Growth */}
          {(profile as any)?.abstain_label && (
            <View style={st.trackerRow}>
              <Text style={st.trackerLabel}>🚫 {(profile as any).abstain_label}</Text>
              <View style={st.trackerBtns}>
                <TouchableOpacity style={[st.trackerBtn, abstainHit === true && st.trackerYes]} onPress={() => setAbstainHit(true)}><Text style={[st.trackerBtnText, abstainHit === true && st.activeText]}>Yes</Text></TouchableOpacity>
                <TouchableOpacity style={[st.trackerBtn, abstainHit === false && st.trackerNo]} onPress={() => setAbstainHit(false)}><Text style={[st.trackerBtnText, abstainHit === false && st.activeText]}>No</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {(profile as any)?.growth_label && (
            <View style={st.trackerRow}>
              <Text style={st.trackerLabel}>🌱 {(profile as any).growth_label}</Text>
              <View style={st.trackerBtns}>
                <TouchableOpacity style={[st.trackerBtn, growthHit === true && st.trackerYes]} onPress={() => setGrowthHit(true)}><Text style={[st.trackerBtnText, growthHit === true && st.activeText]}>Yes</Text></TouchableOpacity>
                <TouchableOpacity style={[st.trackerBtn, growthHit === false && st.trackerNo]} onPress={() => setGrowthHit(false)}><Text style={[st.trackerBtnText, growthHit === false && st.activeText]}>No</Text></TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={st.cta} onPress={submitCheckIn}><Text style={st.ctaText}>Log Check-In</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={st.card}>
          <View style={st.cardRow}><Ionicons name="checkmark-circle" size={20} color="#C0632A" /><Text style={st.cardDone}>Checked in</Text></View>
          {log?.sleep_hours && <Text style={st.statLine}>Sleep: {log.sleep_hours}h · {SLEEP_Q[log.sleep_quality ?? 0] || "Average"}</Text>}
          {log?.mood !== null && log?.mood !== undefined && <Text style={st.statLine}>Mood: {moodLabel(log.mood)}{log.mood_note ? ` — ${log.mood_note}` : ""}</Text>}
          {log?.mood !== null && log?.mood !== undefined && log.mood <= -4 && (
            <View style={st.crisisCard}><Text style={st.crisisText}>If you're in a tough spot, talking to someone helps. You don't have to carry it alone.</Text><Text style={st.crisisLink}>988 Suicide & Crisis Lifeline: call or text 988</Text></View>
          )}
          {log?.weight_lbs && <Text style={st.statLine}>Weight: {log.weight_lbs} lbs</Text>}
          {log?.abstain_hit !== null && <Text style={st.statLine}>🚫 {(profile as any)?.abstain_label || "Abstain"}: {log.abstain_hit ? "✓" : "✗"}</Text>}
          {log?.growth_hit !== null && <Text style={st.statLine}>🌱 {(profile as any)?.growth_label || "Growth"}: {log.growth_hit ? "✓" : "✗"}</Text>}
        </View>
      )}

      {/* ── WORKOUTS ── */}
      <View style={st.card}>
        <View style={st.cardRow}>
          <Text style={st.cardTitle}>Workouts</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {profile?.f3_name && <TouchableOpacity onPress={syncF3}><Ionicons name="sync" size={22} color="#C0632A" /></TouchableOpacity>}
            <TouchableOpacity onPress={() => setShowWorkout(true)}><Ionicons name="add-circle" size={24} color="#C0632A" /></TouchableOpacity>
          </View>
        </View>
        {workouts.length === 0 ? <Text style={st.muted}>No workouts logged today.</Text> : workouts.map((w: any) => (
          <View key={w.id} style={st.workoutRow}>
            <Text style={st.workoutType}>{w.is_f3 ? `F3 — ${w.f3_ao || "Workout"}` : w.workout_label || w.workout_type}</Text>
            <Text style={st.workoutMeta}>{w.duration_minutes}min · RPE {w.rpe} ({RPE_LABELS[w.rpe] || ""}) · ~{w.estimated_calories_burned} cal</Text>
          </View>
        ))}
      </View>

      {/* ── NUTRITION ── */}
      <View style={st.card}>
        <View style={st.cardRow}>
          <Text style={st.cardTitle}>Nutrition</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity onPress={() => setShowFoodResponse(true)}><Ionicons name="body-outline" size={20} color="#C0632A" /></TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert("Snap Food Photo", "Which meal?", [
              { text: "Breakfast", onPress: () => captureFood("breakfast") },
              { text: "Lunch", onPress: () => captureFood("lunch") },
              { text: "Dinner", onPress: () => captureFood("dinner") },
              { text: "Snack", onPress: () => captureFood("snack") },
              { text: "Cancel", style: "cancel" },
            ])} disabled={photoCapturing}>
              {photoCapturing ? <ActivityIndicator size="small" color="#C0632A" /> : <Ionicons name="camera" size={22} color="#C0632A" />}
            </TouchableOpacity>
          </View>
        </View>
        <View style={st.statsRow}>
          <View style={st.stat}><Text style={st.statNum}>{caloriesIn}</Text><Text style={st.statLabel}>IN</Text></View>
          <View style={st.stat}><Text style={st.statNum}>{caloriesOut}</Text><Text style={st.statLabel}>OUT</Text></View>
          <View style={st.stat}><Text style={[st.statNum, { color: "#C0632A" }]}>{caloriesIn - caloriesOut}</Text><Text style={st.statLabel}>NET</Text></View>
        </View>
        {pendingPhotos.length > 0 && (
          <View style={st.pendingSection}>
            <Text style={st.pendingLabel}>{pendingPhotos.filter((p) => p.photo_capture_status === "pending").length} awaiting review</Text>
            {pendingPhotos.map((p: any) => (
              <View key={p.id} style={st.pendingRow}>
                <Ionicons name={p.photo_capture_status === "pending" ? "time-outline" : "checkmark-circle"} size={16} color={p.photo_capture_status === "pending" ? "#9C9A94" : "#C0632A"} />
                <Text style={st.pendingFood}>{p.food_name}</Text>
                {p.calories && <Text style={st.pendingCal}>~{p.calories} cal</Text>}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── STOIC ── */}
      <View style={st.card}>
        <Text style={st.cardTitle}>Stoic Reflection</Text>
        {passage ? (
          <>
            <Text style={st.passage}>"{passage.passage}"</Text>
            <Text style={st.attribution}>— {passage.author}{passage.source ? `, ${passage.source}` : ""}</Text>
          </>
        ) : (
          <Text style={st.muted}>Loading passage...</Text>
        )}
        <TextInput style={[st.input, { marginTop: 16, minHeight: 80, textAlignVertical: "top" }]} placeholder="What does this mean for you today?" placeholderTextColor="#5C5A54" value={reflection} onChangeText={setReflection} multiline />
        <TouchableOpacity style={st.ctaSmall} onPress={saveReflection}><Text style={st.ctaText}>Save Reflection</Text></TouchableOpacity>
      </View>

      {/* ── WORKOUT MODAL ── */}
      <Modal visible={showWorkout} animationType="slide" transparent>
        <View style={st.modalOverlay}><ScrollView contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}><View style={st.modal}>
          <View style={st.cardRow}><Text style={st.cardTitle}>Log Workout</Text><TouchableOpacity onPress={() => setShowWorkout(false)}><Ionicons name="close" size={24} color="#9C9A94" /></TouchableOpacity></View>

          <Text style={st.label}>Type</Text>
          <View style={st.chipRow}>
            {["f3", "strength", "cardio", "mobility", "other"].map((t) => (
              <TouchableOpacity key={t} style={[st.chip, wType === t && st.chipActive]} onPress={() => { setWType(t); setWIsF3(t === "f3"); }}>
                <Text style={[st.chipText, wType === t && st.activeText]}>{t === "f3" ? "F3" : t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {wIsF3 && (
            <>
              <Text style={st.label}>AO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={st.chipRow}>
                  {DSM_AOS.map((ao) => (
                    <TouchableOpacity key={ao} style={[st.chip, wAo === ao && st.chipActive]} onPress={() => setWAo(ao)}>
                      <Text style={[st.chipText, wAo === ao && st.activeText]}>{ao}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TextInput style={st.input} placeholder="Q (leader)" placeholderTextColor="#5C5A54" value={wQ} onChangeText={setWQ} />
            </>
          )}
          {!wIsF3 && <TextInput style={st.input} placeholder="Label (optional)" placeholderTextColor="#5C5A54" value={wLabel} onChangeText={setWLabel} />}

          <Text style={st.label}>Duration (minutes)</Text>
          <TextInput style={st.input} placeholder="45" placeholderTextColor="#5C5A54" value={wDuration} onChangeText={setWDuration} keyboardType="numeric" />

          <Text style={st.label}>RPE: {wRpe} — {RPE_LABELS[wRpe]}</Text>
          <View style={st.rpeRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <TouchableOpacity key={v} style={[st.rpeChip, wRpe === v && st.chipActive]} onPress={() => setWRpe(v)}>
                <Text style={[st.rpeText, wRpe === v && st.activeText]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[st.cta, wSaving && { opacity: 0.6 }]} onPress={submitWorkout} disabled={wSaving}>
            {wSaving ? <ActivityIndicator color="#1C1C1A" /> : <Text style={st.ctaText}>Log Workout</Text>}
          </TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      {/* ── FOOD RESPONSE MODAL ── */}
      <Modal visible={showFoodResponse} animationType="slide" transparent>
        <View style={st.modalOverlay}><View style={st.modal}>
          <View style={st.cardRow}><Text style={st.cardTitle}>How'd the food hit?</Text><TouchableOpacity onPress={() => setShowFoodResponse(false)}><Ionicons name="close" size={24} color="#9C9A94" /></TouchableOpacity></View>

          <Text style={st.label}>Meal</Text>
          <View style={st.chipRow}>
            {["breakfast", "lunch", "dinner", "snack"].map((m) => (
              <TouchableOpacity key={m} style={[st.chip, frMeal === m && st.chipActive]} onPress={() => setFrMeal(m)}>
                <Text style={[st.chipText, frMeal === m && st.activeText]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.label}>Gut</Text>
          <View style={st.chipRow}>
            {["fine", "bloated", "nauseous", "upset", "pain"].map((g) => (
              <TouchableOpacity key={g} style={[st.chip, frGut === g && st.chipActive]} onPress={() => setFrGut(frGut === g ? "" : g)}>
                <Text style={[st.chipText, frGut === g && st.activeText]}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.label}>Energy</Text>
          <View style={st.chipRow}>
            {["steady", "crash", "spike", "sluggish"].map((e) => (
              <TouchableOpacity key={e} style={[st.chip, frEnergy === e && st.chipActive]} onPress={() => setFrEnergy(frEnergy === e ? "" : e)}>
                <Text style={[st.chipText, frEnergy === e && st.activeText]}>{e.charAt(0).toUpperCase() + e.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput style={[st.input, { marginTop: 12, minHeight: 60, textAlignVertical: "top" }]} placeholder="Notes (optional — what happened?)" placeholderTextColor="#5C5A54" value={frNote} onChangeText={setFrNote} multiline />

          <TouchableOpacity style={st.cta} onPress={submitFoodResponse}><Text style={st.ctaText}>Log Response</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  date: { fontSize: 13, color: "#9C9A94" },
  phase: { fontSize: 11, fontWeight: "700", color: "#C0632A", letterSpacing: 2, marginTop: 2, marginBottom: 12 },
  greeting: { fontSize: 26, fontWeight: "800", color: "#F0EDE6", marginBottom: 20 },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 0.5, borderColor: "#5C5A54" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#F0EDE6", marginBottom: 12 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardDone: { fontSize: 14, fontWeight: "600", color: "#C0632A", marginLeft: 8 },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  weightReminder: { fontSize: 11, color: "#C0632A", textTransform: "none", letterSpacing: 0 },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54", marginBottom: 4 },
  sleepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sleepUnit: { fontSize: 13, color: "#9C9A94", fontWeight: "600" },
  sqRow: { flexDirection: "row", gap: 3 },
  sqChip: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54" },
  sqActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  sqText: { color: "#9C9A94", fontSize: 12, fontWeight: "600" },
  moodRow: { flexDirection: "row", gap: 3 },
  moodChip: { flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54", alignItems: "center" },
  moodChipText: { color: "#9C9A94", fontSize: 13, fontWeight: "700" },
  moodDisplay: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  activeText: { color: "#1C1C1A" },
  crisisCard: { backgroundColor: "#3D2A2A", borderRadius: 10, padding: 14, marginTop: 12, borderWidth: 0.5, borderColor: "#6B4C5A" },
  crisisText: { fontSize: 14, color: "#F0EDE6", lineHeight: 20 },
  crisisLink: { fontSize: 13, color: "#C0632A", fontWeight: "600", marginTop: 8 },
  trackerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  trackerLabel: { fontSize: 14, color: "#F0EDE6", flex: 1 },
  trackerBtns: { flexDirection: "row", gap: 6 },
  trackerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54" },
  trackerBtnText: { fontSize: 13, fontWeight: "600", color: "#9C9A94" },
  trackerYes: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  trackerNo: { backgroundColor: "#6B4C5A", borderColor: "#6B4C5A" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54" },
  chipActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  chipText: { color: "#9C9A94", fontSize: 13, fontWeight: "600" },
  rpeRow: { flexDirection: "row", gap: 3 },
  rpeChip: { flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54", alignItems: "center" },
  rpeText: { color: "#9C9A94", fontSize: 13, fontWeight: "700" },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  ctaSmall: { backgroundColor: "#C0632A", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 12 },
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
  passage: { fontSize: 16, color: "#F0EDE6", fontStyle: "italic", lineHeight: 24 },
  attribution: { fontSize: 13, color: "#9C9A94", marginTop: 8 },
  pendingSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  pendingLabel: { fontSize: 12, fontWeight: "600", color: "#9C9A94", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  pendingFood: { fontSize: 14, color: "#F0EDE6", flex: 1 },
  pendingCal: { fontSize: 13, color: "#9C9A94" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#2E2D2A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "90%" },
});
