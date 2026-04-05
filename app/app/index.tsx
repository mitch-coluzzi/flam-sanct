import { Redirect } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { session, loading, isOnboarded, role } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1C1C1A" }}>
        <ActivityIndicator size="large" color="#C0632A" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!isOnboarded) return <Redirect href="/(onboarding)/" />;
  if (role === "chef") return <Redirect href="/(chef)/" />;
  return <Redirect href="/(member)/" />;
}
