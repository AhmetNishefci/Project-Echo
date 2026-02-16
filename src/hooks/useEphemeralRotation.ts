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

    const scheduleRotation = () => {
      const { tokenExpiresAt } = useEchoStore.getState();
      // Default to rotating in the standard interval if no expiry is set
      const delay = tokenExpiresAt
        ? Math.max(1_000, tokenExpiresAt - Date.now() - EPHEMERAL_REFRESH_BUFFER_MS)
        : EPHEMERAL_ROTATION_MS - EPHEMERAL_REFRESH_BUFFER_MS;

      timerRef.current = setTimeout(async () => {
        logger.echo("Rotating ephemeral token...");

        // Clear stale pending waves and incoming wave count — the old tokens are no longer valid
        useEchoStore.getState().clearAllPendingWaves();
        useEchoStore.getState().resetIncomingWaves();

        const result = await fetchNewToken();
        if (result) {
          await echoBleManager.rotateToken(result.token);
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
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
