import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import type { Match } from "@/types";

/**
 * Fetch all matches for the current user from the server.
 * Merges with locally persisted matches (deduplicates by matchId).
 * Called on app launch as a fallback to ensure match history is complete.
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
      .select(
        `
        id,
        user_a,
        user_b,
        created_at,
        user_a_profile:profiles!matches_user_a_fkey(instagram_handle),
        user_b_profile:profiles!matches_user_b_fkey(instagram_handle)
        `,
      )
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("fetchMatchesFromServer error", error);
      return;
    }

    if (!data || data.length === 0) return;

    const store = useEchoStore.getState();
    const existingIds = new Set(store.matches.map((m) => m.matchId));

    const serverMatches: Match[] = data
      .filter((row: any) => !existingIds.has(row.id))
      .map((row: any) => {
        const isUserA = row.user_a === user.id;
        const matchedUserId = isUserA ? row.user_b : row.user_a;
        const matchedProfile = isUserA
          ? row.user_b_profile
          : row.user_a_profile;
        const instagramHandle =
          (Array.isArray(matchedProfile)
            ? matchedProfile[0]?.instagram_handle
            : matchedProfile?.instagram_handle) ?? undefined;

        return {
          matchId: row.id,
          matchedUserId,
          instagramHandle,
          createdAt: row.created_at,
          seen: true, // Server-fetched matches are treated as seen
        };
      });

    if (serverMatches.length > 0) {
      // Merge server matches into the store
      for (const match of serverMatches) {
        store.addMatch(match);
      }
      logger.echo("Merged server matches into store", {
        count: serverMatches.length,
      });
    }
  } catch (err) {
    logger.error("fetchMatchesFromServer exception", err);
  }
}
