import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import type { Match } from "@/types";

/**
 * Fetch all matches for the current user from the server.
 * Merges with locally persisted matches (deduplicates by matchId).
 * Uses the get_matched_instagram_handles RPC to securely fetch handles
 * (profiles RLS only allows reading own row, so the old join returned null).
 */
export async function fetchMatchesFromServer(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.error("fetchMatchesFromServer: no user");
      return;
    }

    const { data, error } = await supabase
      .from("matches")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("fetchMatchesFromServer error", error);
      return;
    }

    if (!data || data.length === 0) return;

    // Fetch Instagram handles via authenticated RPC
    const matchIds = data.map((row: any) => row.id);
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

    const store = useEchoStore.getState();
    const existingIds = new Set(store.matches.map((m) => m.matchId));

    const serverMatches: Match[] = data
      .filter((row: any) => !existingIds.has(row.id))
      .map((row: any) => {
        const isUserA = row.user_a === user.id;
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
      logger.echo("Merged server matches into store", {
        count: serverMatches.length,
      });
    }

    // Also update handles for existing matches that may have been missing
    for (const row of data as any[]) {
      const handle = handleMap.get(row.id);
      if (handle) {
        const existing = store.matches.find((m) => m.matchId === row.id);
        if (existing && !existing.instagramHandle) {
          store.updateMatchHandle(row.id, handle);
        }
      }
    }
  } catch (err) {
    logger.error("fetchMatchesFromServer exception", err);
  }
}
