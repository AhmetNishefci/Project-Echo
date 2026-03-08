import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/services/supabase";
import { logger } from "@/utils/logger";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    // Use onAuthStateChange for both initial session and subsequent changes.
    // The INITIAL_SESSION event fires once with the cached session, replacing
    // the old getSession() + onAuthStateChange race condition (C1 fix).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      logger.auth("Auth state changed", { event, hasSession: !!session });
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a0a0a" },
          animation: "fade",
        }}
      >
        {/* Disable back gesture on onboarding screens (H2 fix) */}
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="gender" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="note" options={{ gestureEnabled: false }} />
        <Stack.Screen name="nearby-alerts" options={{ gestureEnabled: false }} />
      </Stack>
    </ErrorBoundary>
  );
}
