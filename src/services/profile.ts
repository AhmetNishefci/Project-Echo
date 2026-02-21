import { supabase } from "./supabase";
import { logger } from "@/utils/logger";
import type { Gender, GenderPreference } from "@/types";

export interface UserProfile {
  instagramHandle: string | null;
  gender: Gender | null;
  genderPreference: GenderPreference | null;
  note: string | null;
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
      .select("instagram_handle, gender, gender_preference, note")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      logger.error("fetchProfile error", error);
      return null;
    }

    return {
      instagramHandle: data?.instagram_handle ?? null,
      gender: data?.gender ?? null,
      genderPreference: data?.gender_preference ?? null,
      note: data?.note ?? null,
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

    const { error } = await supabase
      .from("profiles")
      .update({ gender, gender_preference: genderPreference })
      .eq("id", user.id);

    if (error) {
      logger.error("saveGenderProfile error", error);
      return false;
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

    // Validate: Instagram usernames are 1-30 chars, alphanumeric + dots + underscores
    // Must contain at least one alphanumeric character
    const igRegex = /^(?=.*[a-z0-9])[a-z0-9._]{1,30}$/;
    if (!igRegex.test(handle)) {
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

    const { error } = await supabase
      .from("profiles")
      .update({ note })
      .eq("id", user.id);

    if (error) {
      logger.error("saveNote error", error);
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
