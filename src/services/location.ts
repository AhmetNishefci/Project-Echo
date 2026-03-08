import * as Location from "expo-location";
import { supabase } from "./supabase";
import { getFreshSession } from "./echo/session";
import { logger } from "@/utils/logger";

/**
 * Request "When In Use" location permission.
 * Returns true if granted, false otherwise.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === "granted";
    logger.auth("Location permission", { status, granted });
    return granted;
  } catch (err) {
    logger.error("Location permission request failed", err);
    return false;
  }
}

/**
 * Check if location permission is currently granted.
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Get the user's current position.
 * Uses balanced accuracy (good precision, reasonable battery usage).
 * Returns null if unavailable.
 */
export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const hasPermission = await hasLocationPermission();
    if (!hasPermission) {
      logger.echo("Location permission not granted, skipping");
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (err) {
    logger.error("Failed to get current location", err);
    return null;
  }
}

/**
 * Send the user's location to the server and trigger proximity notifications.
 * Called when the user starts BLE discovery.
 * Non-blocking — failures are logged but don't affect BLE discovery.
 */
export async function updateLocationOnServer(
  latitude: number,
  longitude: number,
): Promise<{ nearbyCount: number; notifiedCount: number } | null> {
  try {
    const session = await getFreshSession();
    if (!session) {
      logger.error("updateLocationOnServer: no session");
      return null;
    }

    const { data, error } = await supabase.functions.invoke(
      "update-location",
      {
        body: { latitude, longitude },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (error) {
      logger.error("updateLocationOnServer error", error);
      return null;
    }

    const result = data as {
      status: string;
      nearby_count: number;
      notified_count: number;
    };

    logger.echo("Location updated", {
      nearbyCount: result.nearby_count,
      notifiedCount: result.notified_count,
    });

    return {
      nearbyCount: result.nearby_count,
      notifiedCount: result.notified_count,
    };
  } catch (err) {
    logger.error("updateLocationOnServer exception", err);
    return null;
  }
}
