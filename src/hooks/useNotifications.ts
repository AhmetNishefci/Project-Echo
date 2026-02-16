import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";

// Lazy-load expo-notifications — may not be available in Expo Go
let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  logger.echo("expo-notifications not available, push disabled");
}

let registerForPushNotifications: (() => Promise<string | null>) | null = null;
try {
  registerForPushNotifications =
    require("@/services/notifications").registerForPushNotifications;
} catch {
  // notifications service depends on expo-notifications too
}

/**
 * Handles push notification registration and response (tap) handling.
 * Gracefully degrades when expo-notifications native module is unavailable.
 */
export function useNotifications() {
  const userId = useAuthStore((s) => s.userId);
  const router = useRouter();
  const responseListener = useRef<{ remove: () => void } | null>(null);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!userId || !registerForPushNotifications) return;

    registerForPushNotifications().catch((err) => {
      logger.error("Push registration failed", err);
    });
  }, [userId]);

  // Handle notification tap → navigate to match screen
  useEffect(() => {
    if (!Notifications) return;

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        logger.echo("Notification tapped", data);

        if (data?.type === "match" && data?.match_id) {
          const store = useEchoStore.getState();
          store.addMatch({
            matchId: data.match_id as string,
            matchedUserId: (data.matched_user_id as string) ?? "unknown",
            instagramHandle: (data.instagram_handle as string) ?? undefined,
            createdAt: (data.created_at as string) ?? new Date().toISOString(),
            seen: false,
          });

          router.push("/(main)/match");
        }
      });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);
}
