import { logger } from "@/utils/logger";

/**
 * Safe haptics wrapper that gracefully degrades when expo-haptics
 * native module is not available (e.g. Expo Go, simulator).
 */

let Haptics: typeof import("expo-haptics") | null = null;

try {
  Haptics = require("expo-haptics");
} catch {
  logger.echo("expo-haptics not available, haptics disabled");
}

export async function impactLight(): Promise<void> {
  try {
    await Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // silently ignore
  }
}

export async function impactMedium(): Promise<void> {
  try {
    await Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // silently ignore
  }
}

export async function notifySuccess(): Promise<void> {
  try {
    await Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // silently ignore
  }
}

export async function notifyError(): Promise<void> {
  try {
    await Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // silently ignore
  }
}
