import { useEffect } from "react";
import {
  subscribeToMatches,
  unsubscribeFromMatches,
} from "@/services/wave/realtime";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/services/supabase";
import { logger } from "@/utils/logger";

/**
 * Subscribes to Supabase Realtime for match events.
 * When a match is detected server-side, the event is broadcast
 * to both users' channels.
 *
 * Also handles session refresh events — when the JWT is refreshed,
 * the Realtime connection is re-established to avoid stale auth.
 */
export function useMatchListener() {
  const userId = useAuthStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;

    logger.wave("Subscribing to match events", { userId });
    subscribeToMatches(userId);

    // Re-subscribe on token refresh so the Realtime connection uses
    // the new JWT (prevents 401 disconnects after session refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "TOKEN_REFRESHED") {
          logger.wave("Token refreshed — re-subscribing to realtime");
          unsubscribeFromMatches();
          subscribeToMatches(userId);
        }
      },
    );

    return () => {
      subscription.unsubscribe();
      unsubscribeFromMatches();
    };
  }, [userId]);
}
