import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

let channel: RealtimeChannel | null = null;

/**
 * Subscribe to match AND wave events for the given user.
 * - "match" events: add match to store so the match screen triggers.
 * - "wave" events: increment incoming wave counter (anonymous notification).
 * - "wave_undo" events: decrement incoming wave counter.
 */
export function subscribeToMatches(userId: string): void {
  if (channel) {
    logger.echo("Already subscribed to realtime");
    return;
  }

  channel = supabase
    .channel(`user:${userId}`)
    .on("broadcast", { event: "match" }, (payload) => {
      logger.echo("Match event received!", payload);

      const data = payload.payload as {
        match_id: string;
        matched_user_id: string;
        instagram_handle?: string;
        created_at?: string;
      };

      if (data.match_id && data.matched_user_id) {
        useEchoStore.getState().addMatch({
          matchId: data.match_id,
          matchedUserId: data.matched_user_id,
          instagramHandle: data.instagram_handle ?? undefined,
          createdAt: data.created_at ?? new Date().toISOString(),
          seen: false,
        });
      }
    })
    .on("broadcast", { event: "wave" }, (payload) => {
      logger.echo("Incoming wave event!", payload);
      const data = payload.payload as { waver_token?: string };
      if (data.waver_token) {
        useEchoStore.getState().addIncomingWaveToken(data.waver_token);
      }
    })
    .on("broadcast", { event: "wave_undo" }, (payload) => {
      logger.echo("Wave undo event received", payload);
      const data = payload.payload as { waver_token?: string };
      if (data.waver_token) {
        useEchoStore.getState().removeIncomingWaveToken(data.waver_token);
      }
    })
    .on("broadcast", { event: "match_removed" }, (payload) => {
      logger.echo("Match removed event received", payload);
      const data = payload.payload as { match_id?: string };
      if (data.match_id) {
        useEchoStore.getState().removeMatch(data.match_id);
      }
    })
    .subscribe((status) => {
      logger.echo("Realtime subscription status", { status });
    });
}

/**
 * Unsubscribe from realtime events.
 */
export function unsubscribeFromMatches(): void {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    logger.echo("Unsubscribed from realtime");
  }
}
