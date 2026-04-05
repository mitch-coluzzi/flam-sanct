import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function ChefLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#1C1C1A" },
        headerTintColor: "#F0EDE6",
        tabBarStyle: { backgroundColor: "#1C1C1A", borderTopColor: "#2E2D2A" },
        tabBarActiveTintColor: "#C0632A",
        tabBarInactiveTintColor: "#9C9A94",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: "Recipes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="member/[id]"
        options={{
          href: null,
          title: "Member Detail",
        }}
      />
    </Tabs>
  );
}
