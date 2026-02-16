import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { echoBleManager } from "@/services/ble/bleManager";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { fetchNewToken } from "@/services/echo/ephemeralId";
import { logger } from "@/utils/logger";

/**
 * Manages BLE lifecycle with app state transitions.
 *
 * Background behavior (iOS):
 * - BLE scanning and advertising continue running in background.
 * - iOS automatically throttles scan frequency when backgrounded.
 * - The local name is stripped from ads; scanners use GATT reads instead.
 * - On return to foreground, we restart the scan cycle at full speed.
 */
export function useBleLifecycle() {
  const wasRunning = useRef(false);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Read BLE state directly from the store to avoid stale closures
      const { isScanning, isAdvertising } = useBleStore.getState();

      if (nextAppState === "background" || nextAppState === "inactive") {
        // Track that BLE was active so we can refresh on foreground return
        if (isScanning || isAdvertising) {
          wasRunning.current = true;
          logger.ble("App backgrounded — BLE continues running (iOS managed)");
        }
      } else if (nextAppState === "active") {
        // Restart scan cycle at full speed when returning to foreground
        if (wasRunning.current) {
          wasRunning.current = false;

          // Check if ephemeral token expired while backgrounded
          const { tokenExpiresAt } = useEchoStore.getState();
          if (!tokenExpiresAt || tokenExpiresAt < Date.now()) {
            logger.echo("Token expired during background — fetching new one before restarting scan");
            fetchNewToken().then((result) => {
              if (result) {
                echoBleManager.rotateToken(result.token).catch((e) =>
                  logger.error("Failed to rotate token on foreground", e),
                );
              }
              // Restart scan cycle only AFTER token is refreshed
              echoBleManager.restartScanCycle();
              logger.ble("App foregrounded — scan cycle restarted after token refresh");
            });
          } else {
            echoBleManager.restartScanCycle();
            logger.ble("App foregrounded — scan cycle restarted at full speed");
          }
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []); // Empty deps — reads from store inside callback
}
