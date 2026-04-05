import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";

export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, isOnboarded, role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "(onboarding)";

    if (!session && !inAuth) {
      router.replace("/(auth)/login");
    } else if (session && !isOnboarded && !inOnboarding) {
      router.replace("/(onboarding)/");
    } else if (session && isOnboarded && (inAuth || inOnboarding)) {
      if (role === "chef") {
        router.replace("/(chef)/");
      } else {
        router.replace("/(member)/");
      }
    }
  }, [session, loading, isOnboarded, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#1C1C1A" },
              headerTintColor: "#F0EDE6",
              headerTitleStyle: { fontWeight: "700" },
              contentStyle: { backgroundColor: "#1C1C1A" },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="(member)" options={{ headerShown: false }} />
            <Stack.Screen name="(chef)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          </Stack>
        </AuthGate>
        <StatusBar style="light" />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
