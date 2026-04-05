import { View, Text, StyleSheet } from "react-native";
import { useAuthStore } from "../../store/auth";

export default function TodayScreen() {
  const profile = useAuthStore((s) => s.profile);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={s.container}>
      <Text style={s.date}>{today}</Text>
      <Text style={s.phase}>The Grind</Text>
      <Text style={s.greeting}>
        {profile?.display_name || profile?.full_name || "PAX"}
      </Text>
      <View style={s.placeholder}>
        <Text style={s.placeholderText}>Check-in card — coming next session</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 24 },
  date: { fontSize: 14, color: "#9C9A94", marginBottom: 2 },
  phase: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C0632A",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  greeting: { fontSize: 24, fontWeight: "800", color: "#F0EDE6", marginBottom: 24 },
  placeholder: {
    backgroundColor: "#2E2D2A",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#5C5A54",
  },
  placeholderText: { color: "#9C9A94", fontSize: 14 },
});
