import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

let channel: RealtimeChannel | null = null;
let currentUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Subscribe to match AND wave events for the given user.
 * - "match" events: add match to store so the match screen triggers.
 * - "wave" events: increment incoming wave counter (anonymous notification).
 * - "wave_undo" events: decrement incoming wave counter.
 * - "match_removed" events: remove match from store.
 *
 * Handles reconnection on subscription errors and session refresh.
 */
export function subscribeToMatches(userId: string): void {
  // If already subscribed to the same user, skip
  if (channel && currentUserId === userId) {
    logger.echo("Already subscribed to realtime");
    return;
  }

  // Clean up any existing subscription before creating a new one
  cleanupChannel();
  currentUserId = userId;

  createChannel(userId);
}

function createChannel(userId: string): void {
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
    .subscribe((status, err) => {
      logger.echo("Realtime subscription status", { status });

      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0; // Reset backoff on success
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        logger.error("Realtime subscription error, scheduling reconnect", err);
        scheduleReconnect(userId);
      }

      if (status === "CLOSED") {
        // Channel was closed externally — only reconnect if we still want it
        if (currentUserId === userId) {
          logger.echo("Realtime channel closed unexpectedly, reconnecting");
          scheduleReconnect(userId);
        }
      }
    });
}

/**
 * Schedule a reconnection attempt with a delay to avoid rapid reconnect loops.
 */
function scheduleReconnect(userId: string): void {
  if (reconnectTimer) return; // Already scheduled

  // Exponential backoff: 3s, 6s, 12s, 24s, ... capped at 60s
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS,
  );
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentUserId !== userId) return; // User changed, skip

    logger.echo(`Attempting realtime reconnect (attempt ${reconnectAttempts})`);
    cleanupChannel();
    createChannel(userId);
  }, delay);
}

function cleanupChannel(): void {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}

/**
 * Unsubscribe from realtime events.
 */
export function unsubscribeFromMatches(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  currentUserId = null;
  cleanupChannel();
  logger.echo("Unsubscribed from realtime");
}
