import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

type Step = "welcome" | "info" | "notifications" | "chef" | "done";

export default function OnboardingScreen() {
  const router = useRouter();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [timezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [saving, setSaving] = useState(false);

  const next = () => {
    const steps: Step[] = ["welcome", "info", "notifications", "chef", "done"];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const requestPush = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        const token = (
          await Notifications.getExpoPushTokenAsync()
        ).data;
        await api("PATCH", "/users/me", { push_token: token });
      }
    } catch {}
    next();
  };

  const finish = async () => {
    setSaving(true);
    const updates: Record<string, any> = {
      display_name: displayName.trim() || undefined,
      timezone,
      weight_unit: weightUnit,
      onboarded_at: true,
    };
    const res = await api("PATCH", "/users/me", updates);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      setSaving(false);
      return;
    }

    // Log initial weight if provided
    if (weight) {
      const today = new Date().toISOString().split("T")[0];
      await api("GET", `/daily-logs/${today}`); // lazy create
      await api("PATCH", `/daily-logs/${today}`, {
        weight_lbs: weightUnit === "kg" ? parseFloat(weight) * 2.20462 : parseFloat(weight),
      });
    }

    await fetchProfile();
    setSaving(false);
  };

  // ── Welcome ──
  if (step === "welcome") {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.brand}>FlamSanct</Text>
          <Text style={s.tagline}>Cast it on yourself. It stays on.</Text>
          <Text style={s.subtitle}>Let's get you set up.</Text>
        </View>
        <TouchableOpacity style={s.button} onPress={next}>
          <Text style={s.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Your Info ──
  if (step === "info") {
    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner}>
        <Text style={s.stepTitle}>Your Info</Text>

        <Text style={s.label}>Display name</Text>
        <TextInput
          style={s.input}
          placeholder="What do they call you?"
          placeholderTextColor="#9C9A94"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <Text style={s.label}>Current weight</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="0"
            placeholderTextColor="#9C9A94"
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />
          <View style={s.unitToggle}>
            <TouchableOpacity
              style={[s.unitBtn, weightUnit === "lbs" && s.unitActive]}
              onPress={() => setWeightUnit("lbs")}
            >
              <Text
                style={[s.unitText, weightUnit === "lbs" && s.unitTextActive]}
              >
                lbs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.unitBtn, weightUnit === "kg" && s.unitActive]}
              onPress={() => setWeightUnit("kg")}
            >
              <Text
                style={[s.unitText, weightUnit === "kg" && s.unitTextActive]}
              >
                kg
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.label}>Timezone</Text>
        <View style={s.tzBox}>
          <Text style={s.tzText}>{timezone}</Text>
        </View>

        <TouchableOpacity style={s.button} onPress={next}>
          <Text style={s.buttonText}>Next</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Notifications ──
  if (step === "notifications") {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.stepTitle}>Notifications</Text>
          <Text style={s.body}>
            FlamSanct sends two daily reminders:{"\n\n"}
            <Text style={s.bold}>6:00 AM</Text> — Morning check-in{"\n"}
            <Text style={s.bold}>8:30 PM</Text> — Evening reflection{"\n\n"}
            You can change these later.
          </Text>
        </View>
        <TouchableOpacity style={s.button} onPress={requestPush}>
          <Text style={s.buttonText}>Enable Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={next}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Your Chef ──
  if (step === "chef") {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.stepTitle}>Your Chef</Text>
          <Text style={s.body}>
            Your chef will be connected by your admin shortly.{"\n\n"}
            Once assigned, they'll log meals for you, review your food photos,
            and receive AI-generated dietary directives based on your data.
          </Text>
        </View>
        <TouchableOpacity style={s.button} onPress={next}>
          <Text style={s.buttonText}>Next</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Done ──
  return (
    <View style={s.container}>
      <View style={s.center}>
        <Text style={s.brand}>Ready.</Text>
        <Text style={s.body}>
          Show up. Log the work. Let the data speak.
        </Text>
      </View>
      <TouchableOpacity
        style={[s.button, saving && s.buttonDisabled]}
        onPress={finish}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#1C1C1A" />
        ) : (
          <Text style={s.buttonText}>Enter FlamSanct</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1A",
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 48,
  },
  scroll: { flex: 1, backgroundColor: "#1C1C1A" },
  scrollInner: { paddingHorizontal: 24, paddingTop: 80, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center" },
  brand: {
    fontSize: 36,
    fontWeight: "900",
    color: "#C0632A",
    textAlign: "center",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#9C9A94",
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: "#F0EDE6",
    textAlign: "center",
    marginTop: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F0EDE6",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9C9A94",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#2E2D2A",
    color: "#F0EDE6",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#5C5A54",
  },
  row: { flexDirection: "row", gap: 12 },
  unitToggle: { flexDirection: "row", gap: 4, alignItems: "center" },
  unitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#2E2D2A",
    borderWidth: 1,
    borderColor: "#5C5A54",
  },
  unitActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  unitText: { color: "#9C9A94", fontWeight: "600" },
  unitTextActive: { color: "#1C1C1A" },
  tzBox: {
    backgroundColor: "#2E2D2A",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#5C5A54",
  },
  tzText: { color: "#F0EDE6", fontSize: 16 },
  body: { fontSize: 16, color: "#9C9A94", lineHeight: 24, textAlign: "center" },
  bold: { fontWeight: "700", color: "#F0EDE6" },
  button: {
    backgroundColor: "#C0632A",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#1C1C1A", fontSize: 16, fontWeight: "700" },
  skipBtn: { alignItems: "center", marginTop: 16 },
  skipText: { color: "#9C9A94", fontSize: 14 },
});
