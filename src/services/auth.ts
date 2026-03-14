import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { supabase } from "./supabase";
import { useAuthStore } from "@/stores/authStore";
import { useWaveStore } from "@/stores/waveStore";
import { useBleStore } from "@/stores/bleStore";
import { waveBleManager } from "@/services/ble/bleManager";
import { unsubscribeFromMatches } from "@/services/wave/realtime";
import { clearOfflineQueue } from "@/services/wave/waves";
import { resetTimezoneSyncCache } from "@/services/profile";
import { logger } from "@/utils/logger";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

// Configure Google Sign In
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  iosClientId: IOS_CLIENT_ID,
});

/**
 * Sign in with Google using the native dialog.
 * Gets a Google ID token, then exchanges it for a Supabase session.
 */
export async function signInWithGoogle(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    logger.auth("Starting Google Sign In");

    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      logger.auth("Google Sign In cancelled");
      return { success: false, error: "cancelled" };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      logger.error("No ID token from Google Sign In");
      return { success: false, error: "No ID token received" };
    }

    logger.auth("Google ID token received, signing in with Supabase...");

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error) {
      logger.error("Supabase signInWithIdToken failed", error);
      return { success: false, error: error.message };
    }

    logger.auth("Google Sign In complete");
    return { success: true };
  } catch (err: unknown) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, error: "cancelled" };
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        return { success: false, error: "Sign in already in progress" };
      }
    }
    logger.error("Google sign-in error", err);
    return { success: false, error: "Something went wrong" };
  }
}

/**
 * Sign out of the current session.
 * Stops BLE, clears Google session, Supabase session, realtime
 * subscriptions, and all local stores.
 *
 * Stores are reset BEFORE supabase.auth.signOut() because signOut
 * triggers onAuthStateChange synchronously, which navigates to login.
 * Stores must be clean before that navigation happens (L2 fix).
 */
export async function signOut(): Promise<void> {
  try {
    // Stop BLE engine (LP3 fix — idempotent if not running)
    try {
      await waveBleManager.stop();
    } catch {
      // Ignore — may not be initialized
    }

    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore — user may not have signed in via Google
    }

    // Unsubscribe from realtime before signing out (H12 fix)
    unsubscribeFromMatches();

    // Clear offline wave queue to prevent stale waves leaking to new session
    clearOfflineQueue();

    // Reset module-level caches (LP2 fix)
    resetTimezoneSyncCache();

    // Reset ALL stores BEFORE signOut so navigation triggered by
    // onAuthStateChange sees clean state (L2 fix)
    useWaveStore.getState().reset();
    useBleStore.getState().reset();
    useAuthStore.getState().reset();

    await supabase.auth.signOut();

    logger.auth("Signed out");
  } catch (err) {
    logger.error("Sign out error", err);
    // Re-throw so callers know sign-out failed (M5 fix)
    throw err;
  }
}
