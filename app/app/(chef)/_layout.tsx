import { TouchableOpacity } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

function HeaderActions() {
  const router = useRouter();
  return (
    <TouchableOpacity onPress={() => router.replace("/(member)/")} style={{ paddingHorizontal: 16 }}>
      <Ionicons name="swap-horizontal-outline" size={22} color="#9C9A94" />
    </TouchableOpacity>
  );
}

export default function ChefLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#1C1C1A" },
        headerTintColor: "#F0EDE6",
        tabBarStyle: { backgroundColor: "#1C1C1A", borderTopColor: "#2E2D2A" },
        tabBarActiveTintColor: "#C0632A",
        tabBarInactiveTintColor: "#9C9A94",
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chef Dashboard",
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
