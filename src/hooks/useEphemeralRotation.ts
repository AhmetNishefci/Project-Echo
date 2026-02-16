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
  const currentToken = useEchoStore((s) => s.currentToken);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch initial token
    fetchNewToken().then((result) => {
      if (result) {
        // Update the advertiser with the new token
        echoBleManager.rotateToken(result.token).catch((error) => {
          logger.error("Failed to update advertiser with initial token", error);
        });
      }
    });

    // Set up rotation timer
    const rotationInterval = EPHEMERAL_ROTATION_MS - EPHEMERAL_REFRESH_BUFFER_MS;

    timerRef.current = setInterval(async () => {
      logger.echo("Rotating ephemeral token...");
      const result = await fetchNewToken();
      if (result) {
        await echoBleManager.rotateToken(result.token);
      }
    }, rotationInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
