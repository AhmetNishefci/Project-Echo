import { useEffect } from "react";
import {
  subscribeToMatches,
  unsubscribeFromMatches,
} from "@/services/echo/realtime";
import { useAuthStore } from "@/stores/authStore";
import { logger } from "@/utils/logger";

/**
 * Subscribes to Supabase Realtime for match events.
 * When a match is detected server-side, the event is broadcast
 * to both users' channels.
 */
export function useMatchListener() {
  const userId = useAuthStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;

    logger.echo("Subscribing to match events", { userId });
    subscribeToMatches(userId);

    return () => {
      unsubscribeFromMatches();
    };
  }, [userId]);
}
