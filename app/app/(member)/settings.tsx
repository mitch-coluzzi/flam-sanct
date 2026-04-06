import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Switch, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile) as any;
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const userId = profile?.id;

  const [displayName, setDisplayName] = useState("");
  const [f3Name, setF3Name] = useState("");
  const [abstainLabel, setAbstainLabel] = useState("");
  const [growthLabel, setGrowthLabel] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [bodyPhotoEnabled, setBodyPhotoEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setF3Name(profile.f3_name || "");
      setAbstainLabel(profile.abstain_label || "");
      setGrowthLabel(profile.growth_label || "");
      setWeightUnit((profile.weight_unit as "lbs" | "kg") || "lbs");
      setBodyPhotoEnabled(profile.body_photo_enabled !== false);
    }
  }, [profile]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    await supabase.from("users").update({
      display_name: displayName.trim() || null,
      f3_name: f3Name.trim() || null,
      abstain_label: abstainLabel.trim() || null,
      growth_label: growthLabel.trim() || null,
      weight_unit: weightUnit,
      body_photo_enabled: bodyPhotoEnabled,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await fetchProfile();
    setSaving(false);
    Alert.alert("Saved.");
  };

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You'll need to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => { await signOut(); router.replace("/(auth)/login"); },
      },
    ]);
  };

  return (
    <ScrollView style={st.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={st.section}>Profile</Text>
      <View style={st.card}>
        <Text style={st.label}>Display Name</Text>
        <TextInput style={st.input} value={displayName} onChangeText={setDisplayName} placeholder="What they call you" placeholderTextColor="#5C5A54" />

        <Text style={st.label}>F3 Name</Text>
        <TextInput style={st.input} value={f3Name} onChangeText={setF3Name} placeholder="Your F3 Nation name" placeholderTextColor="#5C5A54" />
        <Text style={st.hint}>Used for F3 attendance sync</Text>

        <Text style={st.label}>Weight Unit</Text>
        <View style={st.unitRow}>
          <TouchableOpacity style={[st.unitBtn, weightUnit === "lbs" && st.unitActive]} onPress={() => setWeightUnit("lbs")}>
            <Text style={[st.unitText, weightUnit === "lbs" && st.unitActiveText]}>lbs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.unitBtn, weightUnit === "kg" && st.unitActive]} onPress={() => setWeightUnit("kg")}>
            <Text style={[st.unitText, weightUnit === "kg" && st.unitActiveText]}>kg</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={st.section}>Daily Trackers</Text>
      <View style={st.card}>
        <Text style={st.label}>Abstain Label</Text>
        <TextInput style={st.input} value={abstainLabel} onChangeText={setAbstainLabel} placeholder="e.g. No alcohol, Limited screens" placeholderTextColor="#5C5A54" />
        <Text style={st.hint}>The thing you want to avoid daily</Text>

        <Text style={st.label}>Growth Label</Text>
        <TextInput style={st.input} value={growthLabel} onChangeText={setGrowthLabel} placeholder="e.g. Read 10 pages, Family engage" placeholderTextColor="#5C5A54" />
        <Text style={st.hint}>The thing you want to do daily</Text>
      </View>

      <Text style={st.section}>Privacy</Text>
      <View style={st.card}>
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.switchLabel}>Body Photo</Text>
            <Text style={st.hint}>Monthly body photo prompts on weight check-in</Text>
          </View>
          <Switch
            value={bodyPhotoEnabled}
            onValueChange={setBodyPhotoEnabled}
            trackColor={{ false: "#3D3C38", true: "#C0632A" }}
            thumbColor="#F0EDE6"
          />
        </View>
      </View>

      <TouchableOpacity style={[st.cta, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#1C1C1A" /> : <Text style={st.ctaText}>Save Changes</Text>}
      </TouchableOpacity>

      <Text style={st.section}>Account</Text>
      <View style={st.card}>
        <View style={st.infoRow}>
          <Text style={st.infoLabel}>Email</Text>
          <Text style={st.infoValue}>{profile?.email}</Text>
        </View>
        <View style={st.infoRow}>
          <Text style={st.infoLabel}>Role</Text>
          <Text style={st.infoValue}>{profile?.role}</Text>
        </View>
      </View>

      {(profile?.role === "chef" || profile?.role === "admin") && (
        <TouchableOpacity style={st.switchBtn} onPress={() => router.replace("/(chef)/")}>
          <Ionicons name="restaurant-outline" size={20} color="#C0632A" />
          <Text style={st.switchText}>Switch to Chef View</Text>
        </TouchableOpacity>
      )}
      {profile?.role === "admin" && (
        <TouchableOpacity style={st.switchBtn} onPress={() => router.replace("/(admin)/")}>
          <Ionicons name="shield-outline" size={20} color="#C0632A" />
          <Text style={st.switchText}>Switch to Admin View</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={st.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#9C9A94" />
        <Text style={st.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 16 },
  section: { fontSize: 11, fontWeight: "700", color: "#C0632A", letterSpacing: 2, marginTop: 16, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: "#5C5A54" },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  hint: { fontSize: 12, color: "#5C5A54", marginTop: 4 },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54" },
  unitRow: { flexDirection: "row", gap: 8 },
  unitBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#1C1C1A", alignItems: "center", borderWidth: 0.5, borderColor: "#5C5A54" },
  unitActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  unitText: { color: "#9C9A94", fontWeight: "600" },
  unitActiveText: { color: "#1C1C1A" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 15, fontWeight: "600", color: "#F0EDE6" },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 20 },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  infoLabel: { fontSize: 14, color: "#9C9A94" },
  infoValue: { fontSize: 14, color: "#F0EDE6", fontWeight: "600" },
  switchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 12, backgroundColor: "#2E2D2A", borderRadius: 8, borderWidth: 0.5, borderColor: "#C0632A" },
  switchText: { fontSize: 15, color: "#C0632A", fontWeight: "700" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, marginTop: 16 },
  signOutText: { fontSize: 15, color: "#9C9A94", fontWeight: "600" },
});
