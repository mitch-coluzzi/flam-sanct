import { View, Text, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";

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
  row: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  date: { fontSize: 13, color: "#9C9A94" },
  phase: { fontSize: 11, fontWeight: "700", color: "#C0632A", letterSpacing: 2 },
  name: { fontSize: 14, fontWeight: "700", color: "#F0EDE6", marginLeft: "auto" },
});

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
    </Tabs>
  );
}
