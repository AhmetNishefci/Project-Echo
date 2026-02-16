import { useEffect, useRef } from "react";
import { fetchNewToken } from "@/services/echo/ephemeralId";
import { echoBleManager } from "@/services/ble/bleManager";
import { useEchoStore } from "@/stores/echoStore";
import { useAuthStore } from "@/stores/authStore";
import {
  EPHEMERAL_ROTATION_MS,
  EPHEMERAL_REFRESH_BUFFER_MS,
} from "@/services/ble/constants";
import { logger } from "@/utils/logger";

/**
 * Manages ephemeral token lifecycle: initial fetch and periodic rotation.
 * Rotates the token 3 minutes before expiry to ensure seamless coverage.
 */
export function useEphemeralRotation() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Guard: if the effect is cleaned up while an async operation is
    // still in-flight, the callback must become a no-op to prevent
    // orphaned timer chains that double server load on every toggle.
    let aborted = false;
    let consecutiveFailures = 0;

    const scheduleRotation = () => {
      if (aborted) return;

      let delay: number;
      if (consecutiveFailures > 0) {
        // Exponential backoff on failure: 30s, 60s, 120s, capped at 5 min
        delay = Math.min(30_000 * Math.pow(2, consecutiveFailures - 1), 5 * 60_000);
        logger.echo(`Token rotation backoff: retry in ${Math.round(delay / 1000)}s (failure #${consecutiveFailures})`);
      } else {
        const { tokenExpiresAt } = useEchoStore.getState();
        // Default to rotating in the standard interval if no expiry is set
        delay = tokenExpiresAt
          ? Math.max(1_000, tokenExpiresAt - Date.now() - EPHEMERAL_REFRESH_BUFFER_MS)
          : EPHEMERAL_ROTATION_MS - EPHEMERAL_REFRESH_BUFFER_MS;
      }

      timerRef.current = setTimeout(async () => {
        if (aborted) return;

        logger.echo("Rotating ephemeral token...");

        // Clear stale pending waves and incoming wave count — the old tokens are no longer valid
        useEchoStore.getState().clearAllPendingWaves();
        useEchoStore.getState().resetIncomingWaves();

        const result = await fetchNewToken();
        if (aborted) return;

        if (result) {
          consecutiveFailures = 0;
          await echoBleManager.rotateToken(result.token);
        } else {
          consecutiveFailures++;
        }

        // Schedule the next rotation based on the NEW token's expiry
        scheduleRotation();
      }, delay);
    };

    // Only fetch a new token if we don't have a valid one
    const { currentToken: existingToken, tokenExpiresAt } = useEchoStore.getState();
    const hasValidToken = existingToken && tokenExpiresAt && tokenExpiresAt > Date.now() + EPHEMERAL_REFRESH_BUFFER_MS;

    if (!hasValidToken) {
      fetchNewToken().then((result) => {
        if (aborted) return;
        if (result) {
          echoBleManager.rotateToken(result.token).catch((error) => {
            logger.error("Failed to update advertiser with initial token", error);
          });
        }
        // Schedule next rotation based on the fetched token's expiry
        scheduleRotation();
      });
    } else {
      // Token is valid — schedule rotation based on its actual expiry
      scheduleRotation();
    }

    return () => {
      aborted = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
