import { Platform, PermissionsAndroid, Linking, Alert } from "react-native";
import { BleManager } from "react-native-ble-plx";
import type { BlePermissionStatus } from "@/types";
import { logger } from "@/utils/logger";

/**
 * Request all BLE-related permissions for the current platform.
 * Returns the overall permission status.
 */
export async function requestBlePermissions(
  bleManager: BleManager,
): Promise<BlePermissionStatus> {
  if (Platform.OS === "ios") {
    return requestIOSPermissions(bleManager);
  }
  return requestAndroidPermissions();
}

async function requestIOSPermissions(
  bleManager: BleManager,
): Promise<BlePermissionStatus> {
  // On iOS, requesting BLE state triggers the system Bluetooth permission dialog.
  // We just need to check the state after initialization.
  return new Promise((resolve) => {
    const sub = bleManager.onStateChange((state) => {
      if (state === "PoweredOn") {
        sub.remove();
        resolve("granted");
      } else if (state === "Unauthorized") {
        sub.remove();
        resolve("denied");
      } else if (state === "PoweredOff") {
        sub.remove();
        // BLE is off but permission may be granted
        resolve("granted");
      }
    }, true);

    // Timeout after 10s - if no state change, assume unknown
    setTimeout(() => {
      sub.remove();
      resolve("unknown");
    }, 10_000);
  });
}

async function requestAndroidPermissions(): Promise<BlePermissionStatus> {
  const apiLevel = Platform.Version as number;

  try {
    if (apiLevel >= 31) {
      // Android 12+ requires granular BLE permissions
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(results).every(
        (v) => v === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (allGranted) return "granted";

      const anyDenied = Object.values(results).some(
        (v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      );

      return anyDenied ? "blocked" : "denied";
    } else {
      // Pre-Android 12: just need location
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location Permission",
          message:
            "Echo needs location permission to discover nearby Bluetooth devices.",
          buttonPositive: "Allow",
        },
      );

      if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
        return "blocked";
      return "denied";
    }
  } catch (error) {
    logger.error("Permission request failed", error);
    return "denied";
  }
}

/**
 * Show alert directing user to system settings when permissions are blocked.
 */
export function showPermissionBlockedAlert(): void {
  Alert.alert(
    "Permissions Required",
    "Echo needs Bluetooth and Location permissions to discover nearby people. Please enable them in Settings.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ],
  );
}
