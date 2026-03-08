import { supabase } from "./supabase";
import { logger } from "@/utils/logger";
import type { Gender, GenderPreference } from "@/types";

// Cache to avoid syncing timezone on every app open
let lastTimezoneSyncMs = 0;
const TIMEZONE_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface UserProfile {
  dateOfBirth: string | null;
  instagramHandle: string | null;
  gender: Gender | null;
  genderPreference: GenderPreference | null;
  note: string | null;
  nearbyAlertsEnabled: boolean;
  nearbyAlertsOnboarded: boolean;
  dailyPushesEnabled: boolean;
}

/**
 * Fetch the current user's profile (gender, preference, Instagram handle).
 */
export async function fetchProfile(): Promise<UserProfile | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("fetchProfile: no user");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("date_of_birth, instagram_handle, gender, gender_preference, note, nearby_alerts_enabled, nearby_alerts_onboarded, daily_pushes_enabled")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      logger.error("fetchProfile error", error);
      return null;
    }

    return {
      dateOfBirth: data?.date_of_birth ?? null,
      instagramHandle: data?.instagram_handle ?? null,
      gender: data?.gender ?? null,
      genderPreference: data?.gender_preference ?? null,
      note: data?.note ?? null,
      nearbyAlertsEnabled: data?.nearby_alerts_enabled ?? true,
      nearbyAlertsOnboarded: data?.nearby_alerts_onboarded ?? false,
      dailyPushesEnabled: data?.daily_pushes_enabled ?? true,
    };
  } catch (err) {
    logger.error("fetchProfile exception", err);
    return null;
  }
}

/**
 * Fetch the current user's Instagram handle from their profile.
 * Returns null if not set.
 */
export async function fetchInstagramHandle(): Promise<string | null> {
  const profile = await fetchProfile();
  return profile?.instagramHandle ?? null;
}

/**
 * Save the user's date of birth (set once, immutable via DB trigger).
 * Expects YYYY-MM-DD format.
 */
export async function saveDateOfBirth(dob: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveDateOfBirth: no user");
      return false;
    }

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ date_of_birth: dob })
      .eq("id", user.id)
      .select("id");

    if (error) {
      logger.error("saveDateOfBirth error", error);
      return false;
    }

    if (!updated || updated.length === 0) {
      logger.error("saveDateOfBirth: no profile row — attempting upsert fallback", { userId: user.id });
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, date_of_birth: dob },
          { onConflict: "id" },
        );

      if (upsertError) {
        logger.error("saveDateOfBirth upsert fallback failed", upsertError);
        return false;
      }
    }

    logger.auth("Date of birth saved", { dob });
    return true;
  } catch (err) {
    logger.error("saveDateOfBirth exception", err);
    return false;
  }
}

/**
 * Save gender and gender preference to the user's profile.
 * Called during onboarding (gender is set once and locked).
 */
export async function saveGenderProfile(
  gender: Gender,
  genderPreference: GenderPreference,
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveGenderProfile: no user");
      return false;
    }

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ gender, gender_preference: genderPreference })
      .eq("id", user.id)
      .select("id");

    if (error) {
      logger.error("saveGenderProfile error", error);
      return false;
    }

    // If no row was updated, the auth trigger may not have fired yet.
    // Fall back to an upsert to create the profile row.
    if (!updated || updated.length === 0) {
      logger.error("saveGenderProfile: no profile row — attempting upsert fallback", { userId: user.id });
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, gender, gender_preference: genderPreference },
          { onConflict: "id" },
        );

      if (upsertError) {
        logger.error("saveGenderProfile upsert fallback failed", upsertError);
        return false;
      }
    }

    logger.auth("Gender profile saved", { gender, genderPreference });
    return true;
  } catch (err) {
    logger.error("saveGenderProfile exception", err);
    return false;
  }
}

/**
 * Update the user's gender preference (changeable from settings).
 */
export async function updateGenderPreference(
  genderPreference: GenderPreference,
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("updateGenderPreference: no user");
      return false;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ gender_preference: genderPreference })
      .eq("id", user.id);

    if (error) {
      logger.error("updateGenderPreference error", error);
      return false;
    }

    logger.auth("Gender preference updated", { genderPreference });
    return true;
  } catch (err) {
    logger.error("updateGenderPreference exception", err);
    return false;
  }
}

/**
 * Save/update the user's Instagram handle.
 * Strips leading @ if present, lowercases, and validates.
 * Returns the cleaned handle on success, null on failure.
 */
export async function saveInstagramHandle(
  rawHandle: string,
): Promise<string | null> {
  try {
    // Clean the handle
    let handle = rawHandle.trim().toLowerCase();
    if (handle.startsWith("@")) {
      handle = handle.substring(1);
    }

    // Validate: Instagram usernames are 1-30 chars, alphanumeric + dots + underscores.
    // Must start and end with alphanumeric, no consecutive dots (M2 fix).
    const igRegex = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;
    if (!igRegex.test(handle) || handle.includes("..")) {
      logger.error("saveInstagramHandle: invalid format", { handle });
      return null;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveInstagramHandle: no user");
      return null;
    }

    // Use the claim_instagram_handle RPC which atomically releases the
    // handle from any orphaned anonymous profile before assigning it.
    const { error } = await supabase.rpc("claim_instagram_handle", {
      p_handle: handle,
    });

    if (error) {
      logger.error("saveInstagramHandle error", error);
      return null;
    }

    logger.auth("Instagram handle saved", { handle });
    return handle;
  } catch (err) {
    logger.error("saveInstagramHandle exception", err);
    return null;
  }
}

/**
 * Save/update the user's note (max 40 chars).
 * Pass null or empty string to clear.
 */
export async function saveNote(rawNote: string | null): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveNote: no user");
      return false;
    }

    const note = rawNote?.trim() || null;

    if (note && note.length > 40) {
      logger.error("saveNote: exceeds 40 chars", { length: note.length });
      return false;
    }

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ note })
      .eq("id", user.id)
      .select("id");

    if (error) {
      logger.error("saveNote error", error);
      return false;
    }

    // Check that a row was actually updated (H5 fix)
    if (!updated || updated.length === 0) {
      logger.error("saveNote: no profile row found for user", { userId: user.id });
      return false;
    }

    // Also update the active ephemeral token so nearby users see the change
    // immediately (within the next 5s polling tick) instead of waiting for
    // the next token rotation (~15 min).
    const { error: rpcError } = await supabase.rpc("update_active_note", {
      p_note: note,
    });
    if (rpcError) {
      // Non-fatal: profile is saved, token will catch up on next rotation
      logger.error("update_active_note RPC error (non-fatal)", rpcError);
    }

    logger.auth("Note saved", { note });
    return true;
  } catch (err) {
    logger.error("saveNote exception", err);
    return false;
  }
}

/**
 * Save/update the user's nearby alerts preference.
 */
export async function saveNearbyAlertsPreference(
  enabled: boolean,
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveNearbyAlertsPreference: no user");
      return false;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ nearby_alerts_enabled: enabled, nearby_alerts_onboarded: true })
      .eq("id", user.id);

    if (error) {
      logger.error("saveNearbyAlertsPreference error", error);
      return false;
    }

    logger.auth("Nearby alerts preference saved", { enabled });
    return true;
  } catch (err) {
    logger.error("saveNearbyAlertsPreference exception", err);
    return false;
  }
}

/**
 * Save/update the user's daily engagement pushes preference.
 */
export async function saveDailyPushesPreference(
  enabled: boolean,
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("saveDailyPushesPreference: no user");
      return false;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ daily_pushes_enabled: enabled })
      .eq("id", user.id);

    if (error) {
      logger.error("saveDailyPushesPreference error", error);
      return false;
    }

    logger.auth("Daily pushes preference saved", { enabled });
    return true;
  } catch (err) {
    logger.error("saveDailyPushesPreference exception", err);
    return false;
  }
}

/**
 * Sync the device timezone and last_active_at to the user's profile.
 * Called on app open. Throttled to once per 7 days for timezone,
 * but always updates last_active_at.
 */
export async function syncTimezoneAndActivity(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const now = Date.now();
    const updates: Record<string, unknown> = {
      last_active_at: new Date().toISOString(),
    };

    // Sync timezone periodically (defense-in-depth: validate IANA format)
    if (now - lastTimezoneSyncMs > TIMEZONE_SYNC_INTERVAL_MS) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Validate: IANA timezones contain a "/" (e.g. "America/New_York", "Asia/Tokyo")
        // Reject bare offsets like "UTC" or invalid strings
        if (tz && tz.includes("/")) {
          updates.timezone = tz;
          lastTimezoneSyncMs = now;
        }
      } catch {
        // Intl not available on some engines — skip
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (error) {
      logger.error("syncTimezoneAndActivity error", error);
    }
  } catch (err) {
    logger.error("syncTimezoneAndActivity exception", err);
  }
}
