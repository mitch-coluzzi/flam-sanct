import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

const SCREEN_W = Dimensions.get("window").width;

function TodayHeader() {
  const profile = useAuthStore((s) => s.profile);
  const [streak, setStreak] = useState(0);
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const name = profile?.display_name || profile?.full_name || "PAX";

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data } = await supabase
        .from("workouts")
        .select("log_date")
        .eq("user_id", profile.id)
        .order("log_date", { ascending: false })
        .limit(60);
      const dates = new Set((data || []).map((w: any) => w.log_date));
      let s = 0;
      const check = new Date();
      while (dates.has(check.toISOString().split("T")[0])) {
        s++;
        check.setDate(check.getDate() - 1);
      }
      setStreak(s);
    })();
  }, [profile?.id]);

  return (
    <View style={h.row}>
      <View style={h.left}>
        <Text style={h.date}>{today}</Text>
        {streak > 0 && (
          <View style={h.streakBadge}>
            <Ionicons name="flame" size={12} color="#C0632A" />
            <Text style={h.streakNum}>{streak}</Text>
          </View>
        )}
      </View>
      <Text style={h.phase}>THE GRIND</Text>
      <Text style={h.name}>{name}</Text>
    </View>
  );
}
const h = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: SCREEN_W - 32 },
  left: { flexDirection: "row", alignItems: "center", gap: 6 },
  date: { fontSize: 15, fontWeight: "600", color: "#F0EDE6" },
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#2E2D2A", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 0.5, borderColor: "#C0632A" },
  streakNum: { fontSize: 12, fontWeight: "800", color: "#C0632A" },
  phase: { fontSize: 14, fontWeight: "700", color: "#C0632A", letterSpacing: 2 },
  name: { fontSize: 16, fontWeight: "700", color: "#F0EDE6" },
});

function SettingsIcon() {
  const router = useRouter();
  return (
    <TouchableOpacity onPress={() => router.push("/(member)/settings")} style={{ paddingHorizontal: 16 }}>
      <Ionicons name="settings-outline" size={22} color="#9C9A94" />
    </TouchableOpacity>
  );
}

export default function MemberLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#C0632A",
        tabBarInactiveTintColor: "#9C9A94",
        tabBarStyle: {
          backgroundColor: "#1C1C1A",
          borderTopColor: "#2E2D2A",
        },
        headerStyle: { backgroundColor: "#1C1C1A" },
        headerTintColor: "#F0EDE6",
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => <SettingsIcon />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: () => <TodayHeader />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame" size={size} color={color} />
          ),
          tabBarLabel: "Today",
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "Ask",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: null,
        }}
      />
    </Tabs>
  );
}
