import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1C1C1A" },
        headerTintColor: "#F0EDE6",
        contentStyle: { backgroundColor: "#1C1C1A" },
      }}
    />
  );
}
