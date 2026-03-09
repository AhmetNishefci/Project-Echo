import { supabase } from "../supabase";
import { useWaveStore } from "@/stores/waveStore";
import { logger } from "@/utils/logger";
import type { Match } from "@/types";

const PAGE_SIZE = 50;

/**
 * Fetch the first page of matches for the current user from the server.
 * Merges with locally persisted matches (deduplicates by matchId).
 * Uses the get_matched_instagram_handles RPC to securely fetch handles
 * (profiles RLS only allows reading own row, so the old join returned null).
 *
 * Returns true if there are more matches to load, false otherwise.
 */
export async function fetchMatchesFromServer(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("fetchMatchesFromServer: no user");
      return false;
    }

    const { data, error } = await supabase
      .from("matches")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      logger.error("fetchMatchesFromServer error", error);
      return false;
    }

    if (!data || data.length === 0) return false;

    await mergeServerMatches(data, user.id);

    return data.length === PAGE_SIZE;
  } catch (err) {
    logger.error("fetchMatchesFromServer exception", err);
    return false;
  }
}

/**
 * Load the next page of matches older than the given cursor timestamp.
 * Returns true if there are more matches to load.
 */
export async function loadMoreMatches(beforeCursor: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data, error } = await supabase
      .from("matches")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .lt("created_at", beforeCursor)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      logger.error("loadMoreMatches error", error);
      return false;
    }

    if (!data || data.length === 0) return false;

    await mergeServerMatches(data, user.id);

    return data.length === PAGE_SIZE;
  } catch (err) {
    logger.error("loadMoreMatches exception", err);
    return false;
  }
}

/**
 * Shared logic: fetch handles and merge a page of server matches into the store.
 */
async function mergeServerMatches(
  data: { id: string; user_a: string; user_b: string; created_at: string }[],
  userId: string,
): Promise<void> {
  // Fetch Instagram handles via authenticated RPC
  const matchIds = data.map((row) => row.id);
  const { data: handleRows, error: handleError } = await supabase.rpc(
    "get_matched_instagram_handles",
    { p_match_ids: matchIds },
  );

  const handleMap = new Map<string, string>();
  if (!handleError && handleRows) {
    for (const row of handleRows as { match_id: string; instagram_handle: string | null }[]) {
      if (row.instagram_handle) {
        handleMap.set(row.match_id, row.instagram_handle);
      }
    }
  } else if (handleError) {
    logger.error("Failed to fetch match handles via RPC", handleError);
  }

  const store = useWaveStore.getState();
  const existingIds = new Set(store.matches.map((m) => m.matchId));

  const serverMatches: Match[] = data
    .filter((row) => !existingIds.has(row.id))
    .map((row) => {
      const isUserA = row.user_a === userId;
      const matchedUserId = isUserA ? row.user_b : row.user_a;

      return {
        matchId: row.id,
        matchedUserId,
        instagramHandle: handleMap.get(row.id),
        createdAt: row.created_at,
        seen: true, // Server-fetched matches are treated as seen
      };
    });

  if (serverMatches.length > 0) {
    for (const match of serverMatches) {
      store.addMatch(match);
    }
    logger.wave("Merged server matches into store", {
      count: serverMatches.length,
    });
  }

  // Also update handles for existing matches that may have been missing
  for (const row of data) {
    const handle = handleMap.get(row.id);
    if (handle) {
      const existing = store.matches.find((m) => m.matchId === row.id);
      if (existing && !existing.instagramHandle) {
        store.updateMatchHandle(row.id, handle);
      }
    }
  }
}
