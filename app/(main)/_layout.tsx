import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { echoBleManager } from "@/services/ble/bleManager";
import { useEchoStore } from "@/stores/echoStore";
import { useBleLifecycle } from "@/hooks/useBleLifecycle";
import { useEphemeralRotation } from "@/hooks/useEphemeralRotation";
import { useMatchListener } from "@/hooks/useMatchListener";
import { logger } from "@/utils/logger";

export default function MainLayout() {
  const router = useRouter();
  const latestUnseenMatch = useEchoStore((s) => s.latestUnseenMatch);

  // Initialize BLE manager on mount
  useEffect(() => {
    echoBleManager.initialize().catch((error) => {
      logger.error("Failed to initialize BLE manager", error);
    });

    return () => {
      echoBleManager.stop();
    };
  }, []);

  // Manage BLE on app foreground/background
  useBleLifecycle();

  // Fetch and rotate ephemeral tokens
  useEphemeralRotation();

  // Listen for match events via Supabase Realtime
  useMatchListener();

  // Navigate to match screen when a new match arrives
  useEffect(() => {
    if (latestUnseenMatch) {
      router.push("/(main)/match");
    }
  }, [latestUnseenMatch, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0a0a0a" },
      }}
    >
      <Stack.Screen name="radar" />
      <Stack.Screen
        name="match"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}
