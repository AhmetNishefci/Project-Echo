import { supabase } from "./supabase";
import { logger } from "@/utils/logger";

/**
 * Fetch the current user's Instagram handle from their profile.
 * Returns null if not set.
 */
export async function fetchInstagramHandle(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("fetchInstagramHandle: no user");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("instagram_handle")
      .eq("id", user.id)
      .single();

    if (error) {
      logger.error("fetchInstagramHandle error", error);
      return null;
    }

    return data?.instagram_handle ?? null;
  } catch (err) {
    logger.error("fetchInstagramHandle exception", err);
    return null;
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
    const igRegex = /^[a-z0-9._]{1,30}$/;
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
