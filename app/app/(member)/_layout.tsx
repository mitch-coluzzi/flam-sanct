import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";

const SCREEN_W = Dimensions.get("window").width;

function TodayHeader() {
  const profile = useAuthStore((s) => s.profile);
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const name = profile?.display_name || profile?.full_name || "PAX";
  return (
    <View style={h.row}>
      <Text style={h.date}>{today}</Text>
      <Text style={h.phase}>THE GRIND</Text>
      <Text style={h.name}>{name}</Text>
    </View>
  );
}
const h = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: SCREEN_W - 32 },
  date: { fontSize: 15, fontWeight: "600", color: "#F0EDE6" },
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
        name="ai"
        options={{
          title: "Ask",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles" size={size} color={color} />
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
