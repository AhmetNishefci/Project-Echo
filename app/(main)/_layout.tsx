import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { echoBleManager } from "@/services/ble/bleManager";
import { useEchoStore } from "@/stores/echoStore";
import { useBleLifecycle } from "@/hooks/useBleLifecycle";
import { useEphemeralRotation } from "@/hooks/useEphemeralRotation";
import { useMatchListener } from "@/hooks/useMatchListener";
import { useNotifications } from "@/hooks/useNotifications";
import { logger } from "@/utils/logger";

export default function MainLayout() {
  const router = useRouter();
  const latestUnseenMatch = useEchoStore((s) => s.latestUnseenMatch);
  const unseenCount = useEchoStore(
    (s) => s.matches.filter((m) => !m.seen).length,
  );

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

  // Push notification registration & tap handling
  useNotifications();

  // Navigate to match screen when a new match arrives (with guard against double push)
  const navigatedMatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (latestUnseenMatch && latestUnseenMatch.matchId !== navigatedMatchRef.current) {
      navigatedMatchRef.current = latestUnseenMatch.matchId;
      router.push("/(main)/match");
    }
  }, [latestUnseenMatch, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopColor: "#1a1a2e",
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 30,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#6c63ff",
        tabBarInactiveTintColor: "#666680",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="radar"
        options={{
          title: "Radar",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>📡</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Matches",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>💜</Text>
          ),
          tabBarBadge: unseenCount > 0 ? unseenCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#ff6b6b",
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>⚙️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          href: null, // Hide from tab bar — opened programmatically
        }}
      />
    </Tabs>
  );
}
