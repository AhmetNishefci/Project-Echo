import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

let channel: RealtimeChannel | null = null;

/**
 * Subscribe to match events for the given user.
 * When the server broadcasts a 'match' event to this user's channel,
 * the match is added to the store and the UI reacts.
 */
export function subscribeToMatches(userId: string): void {
  if (channel) {
    logger.echo("Already subscribed to matches");
    return;
  }

  channel = supabase
    .channel(`user:${userId}`)
    .on("broadcast", { event: "match" }, (payload) => {
      logger.echo("Match event received!", payload);

      const data = payload.payload as {
        match_id: string;
        matched_user_id: string;
        created_at?: string;
      };

      if (data.match_id && data.matched_user_id) {
        useEchoStore.getState().addMatch({
          matchId: data.match_id,
          matchedUserId: data.matched_user_id,
          createdAt: data.created_at ?? new Date().toISOString(),
          seen: false,
        });
      }
    })
    .subscribe((status) => {
      logger.echo("Realtime subscription status", { status });
    });
}

/**
 * Unsubscribe from match events.
 */
export function unsubscribeFromMatches(): void {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    logger.echo("Unsubscribed from matches");
  }
}
