import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import type { WaveResult } from "@/types";
import { logger } from "@/utils/logger";
import { getFreshSession } from "./session";

/**
 * Send a wave at a nearby peer identified by their ephemeral token.
 * Returns 'pending' if the wave was recorded, 'match' if mutual,
 * or 'error' if something went wrong.
 */
export async function sendWave(
  targetEphemeralToken: string,
): Promise<WaveResult> {
  try {
    useEchoStore.getState().setWaving(true);

    const session = await getFreshSession();

    if (!session) {
      logger.error("Cannot send wave: no active session");
      return "error";
    }

    const { data, error } = await supabase.functions.invoke("send-wave", {
      body: { target_ephemeral_token: targetEphemeralToken },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      logger.error("Wave failed", error);
      return "error";
    }

    const result = data as {
      status: string;
      match_id?: string;
      matched_user_id?: string;
      instagram_handle?: string;
      reason?: string;
    };

    logger.echo("Wave result", result);

    if (result.status === "match" && result.match_id && result.matched_user_id) {
      useEchoStore.getState().addMatch({
        matchId: result.match_id,
        matchedUserId: result.matched_user_id,
        instagramHandle: result.instagram_handle ?? undefined,
        createdAt: new Date().toISOString(),
        seen: false,
      });
      return "match";
    }

    if (result.status === "pending") {
      return "pending";
    }

    if (result.status === "already_matched") {
      // Re-populate local match history if match details are available
      // (covers the case where user cleared their match history)
      if (result.match_id && result.matched_user_id) {
        useEchoStore.getState().addMatch({
          matchId: result.match_id,
          matchedUserId: result.matched_user_id,
          instagramHandle: result.instagram_handle ?? undefined,
          createdAt: new Date().toISOString(),
          seen: true, // Don't trigger match screen again
        });
      }
      return "already_matched";
    }

    if (result.status === "error" && result.reason === "rate_limited") {
      return "rate_limited";
    }

    return "error";
  } catch (error) {
    logger.error("Wave error", error);
    return "error";
  } finally {
    useEchoStore.getState().setWaving(false);
  }
}

/**
 * Undo a wave that was sent within the undo window.
 * Deletes the wave record server-side.
 */
export async function undoWave(
  targetEphemeralToken: string,
): Promise<boolean> {
  try {
    const session = await getFreshSession();

    if (!session) return false;

    const { error } = await supabase.functions.invoke("send-wave", {
      body: {
        target_ephemeral_token: targetEphemeralToken,
        action: "undo",
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      logger.error("Undo wave failed", error);
      return false;
    }

    useEchoStore.getState().removePendingWave(targetEphemeralToken);
    logger.echo("Wave undone", { token: targetEphemeralToken.substring(0, 8) });
    return true;
  } catch (error) {
    logger.error("Undo wave error", error);
    return false;
  }
}

/**
 * Remove a match server-side. Deletes the match row for both users
 * and broadcasts a match_removed event to the other user.
 * Returns true if successfully removed.
 */
export async function removeMatchFromServer(matchId: string): Promise<boolean> {
  try {
    const session = await getFreshSession();
    if (!session) return false;

    const { error } = await supabase.functions.invoke("remove-match", {
      body: { match_id: matchId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      logger.error("Remove match failed", error);
      return false;
    }

    useEchoStore.getState().removeMatch(matchId);
    logger.echo("Match removed", { matchId });
    return true;
  } catch (error) {
    logger.error("Remove match error", error);
    return false;
  }
}
