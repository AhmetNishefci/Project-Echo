import { Platform } from "react-native";
import { supabase } from "./supabase";
import { logger } from "@/utils/logger";

// Lazy-load native modules — may not be available in Expo Go
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
} catch {
  logger.echo("expo-notifications not available");
}

try {
  Device = require("expo-device");
} catch {
  logger.echo("expo-device not available");
}

/**
 * Configure notification handler (how notifications appear when app is foregrounded)
 */
try {
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // ignore if native module missing
}

/**
 * Request notification permissions and register push token with Supabase.
 * Returns the Expo push token or null if unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) {
    logger.echo("Push notifications not available (native modules missing)");
    return null;
  }

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    logger.echo("Push notifications require a physical device");
    return null;
  }

  // Check / request permissions
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    logger.echo("Push notification permission not granted");
    return null;
  }

  try {
    // Get the native APNs/FCM token (not Expo push token, since we send via APNs directly)
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const pushToken = tokenData.data as string;
    const platform = Platform.OS; // 'ios' or 'android'

    logger.echo("Got device push token", {
      token: pushToken.substring(0, 12) + "...",
      platform,
    });

    // Upsert to Supabase
    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          token: pushToken,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );

    if (error) {
      logger.error("Failed to save push token to Supabase", error);
    } else {
      logger.echo("Push token registered with Supabase");
    }

    return pushToken;
  } catch (err) {
    logger.error("Failed to get push token", err);
    return null;
  }
}

/**
 * Remove push token from Supabase (e.g. on logout)
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;

    await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("platform", Platform.OS);

    logger.echo("Push token unregistered");
  } catch (err) {
    logger.error("Failed to unregister push token", err);
  }
}
