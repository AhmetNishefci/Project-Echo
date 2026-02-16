import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { echoBleManager } from "@/services/ble/bleManager";
import { useBleStore } from "@/stores/bleStore";
import { logger } from "@/utils/logger";

/**
 * Manages BLE lifecycle based on app foreground/background state.
 * Stops BLE when app goes to background, resumes when foregrounded.
 */
export function useBleLifecycle() {
  const isScanning = useBleStore((s) => s.isScanning);
  const isAdvertising = useBleStore((s) => s.isAdvertising);
  const wasRunning = useRef(false);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        // App going to background - stop BLE to save battery
        if (isScanning || isAdvertising) {
          wasRunning.current = true;
          echoBleManager.stop().catch((error) => {
            logger.error("Failed to stop BLE on background", error);
          });
          logger.ble("BLE stopped (app backgrounded)");
        }
      } else if (nextAppState === "active") {
        // App coming to foreground - resume if was running
        if (wasRunning.current) {
          wasRunning.current = false;
          echoBleManager.start().catch((error) => {
            logger.error("Failed to resume BLE on foreground", error);
          });
          logger.ble("BLE resumed (app foregrounded)");
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
  }, [isScanning, isAdvertising]);
}
