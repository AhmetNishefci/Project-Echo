import { useEffect, useRef } from "react";
import { supabase } from "@/services/supabase";
import { useBleStore } from "@/stores/bleStore";
import { logger } from "@/utils/logger";

const POLL_INTERVAL_MS = 30_000; // Poll every 30s (was 10s) to reduce server load on Free tier
const FULL_REFRESH_TICKS = 4; // Re-resolve ALL tokens every 120s to catch note changes

/**
 * Polls the server to resolve peer notes for tokens discovered via BLE.
 * Tracks already-resolved tokens in a Set ref to avoid redundant network calls.
 * Every FULL_REFRESH_TICKS ticks, re-queries all tokens to pick up note changes.
 * Patches resolved notes directly onto peers in bleStore.
 */
export function useNoteResolver(isDiscoveryActive: boolean): void {
  const resolvedRef = useRef<Set<string>>(new Set());
  const tickCountRef = useRef(0);
  const inFlightRef = useRef(false);

  // Clear resolved set when discovery stops
  useEffect(() => {
    if (!isDiscoveryActive) {
      resolvedRef.current.clear();
      tickCountRef.current = 0;
    }
  }, [isDiscoveryActive]);

  useEffect(() => {
    if (!isDiscoveryActive) return;

    const tick = async () => {
      // Guard against overlapping ticks on slow networks
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const peers = useBleStore.getState().nearbyPeers;
        tickCountRef.current += 1;

        // Every FULL_REFRESH_TICKS, clear resolved set to re-query all tokens.
        // This catches note changes on already-resolved tokens (~30s latency).
        const isFullRefresh = tickCountRef.current % FULL_REFRESH_TICKS === 0;
        if (isFullRefresh) {
          resolvedRef.current.clear();
        }

        const unresolvedTokens: string[] = [];

        for (const token of peers.keys()) {
          if (!resolvedRef.current.has(token)) {
            unresolvedTokens.push(token);
          }
        }

        // Prune resolved set: remove tokens no longer in peers
        for (const token of Array.from(resolvedRef.current)) {
          if (!peers.has(token)) {
            resolvedRef.current.delete(token);
          }
        }

        if (unresolvedTokens.length === 0) return;

        // Cap batch size to avoid oversized RPC payloads (M17 fix)
        const MAX_BATCH = 30;
        const batchedTokens = unresolvedTokens.slice(0, MAX_BATCH);

        const { data, error } = await supabase.rpc("resolve_peer_notes", {
          p_tokens: batchedTokens,
        });

        if (error) {
          logger.error("resolve_peer_notes RPC error", error);
          return;
        }

        // Mark all queried tokens as resolved (even if they had no note)
        for (const token of batchedTokens) {
          resolvedRef.current.add(token);
        }

        // Build a lookup map from the response
        const noteMap = new Map<string, string | null>();
        for (const row of data as { token: string; note: string | null }[]) {
          noteMap.set(row.token, row.note);
        }

        // Tokens that were queried but returned no note — clear any stale note
        for (const token of batchedTokens) {
          if (!noteMap.has(token)) {
            noteMap.set(token, null);
          }
        }

        // Patch notes onto peers in bleStore
        useBleStore.setState((state) => {
          const next = new Map(state.nearbyPeers);
          let changed = false;
          for (const [token, note] of noteMap) {
            const peer = next.get(token);
            if (peer && peer.note !== note) {
              next.set(token, { ...peer, note });
              changed = true;
            }
          }
          return changed ? { nearbyPeers: next } : state;
        });
      } catch (err) {
        logger.error("useNoteResolver tick error", err);
      } finally {
        inFlightRef.current = false;
      }
    };

    // Run immediately on mount, then poll
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isDiscoveryActive]);
}
