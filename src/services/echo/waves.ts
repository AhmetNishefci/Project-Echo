import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import type { WaveResult, Match } from "@/types";
import { logger } from "@/utils/logger";
import { getFreshSession } from "./session";

/** Result returned by sendWave with optional match data */
export interface SendWaveResult {
  status: WaveResult;
  match?: Match;
  targetUserId?: string;
}

/**
 * Send a wave at a nearby peer identified by their ephemeral token.
 * Returns the wave result status and optional match data.
 * The caller is responsible for updating the store based on the result.
 */
export async function sendWave(
  targetEphemeralToken: string,
): Promise<SendWaveResult> {
  try {
    useEchoStore.getState().setWaving(true);

    const session = await getFreshSession();

    if (!session) {
      logger.error("Cannot send wave: no active session");
      return { status: "error" };
    }

    const { data, error } = await supabase.functions.invoke("send-wave", {
      body: { target_ephemeral_token: targetEphemeralToken },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      logger.error("Wave failed", error);
      return { status: "error" };
    }

    const result = data as {
      status: string;
      match_id?: string;
      matched_user_id?: string;
      target_user_id?: string;
      instagram_handle?: string;
      reason?: string;
    };

    logger.echo("Wave result", result);

    if (result.status === "match" && result.match_id && result.matched_user_id) {
      const match: Match = {
        matchId: result.match_id,
        matchedUserId: result.matched_user_id,
        instagramHandle: result.instagram_handle ?? undefined,
        createdAt: new Date().toISOString(),
        seen: false,
      };
      // Store update: caller can also do this, but we keep it here for
      // backward compatibility and because match screen routing depends on it
      useEchoStore.getState().addMatch(match);
      return { status: "match", match };
    }

    if (result.status === "pending") {
      return { status: "pending", targetUserId: result.target_user_id };
    }

    if (result.status === "already_matched") {
      if (result.match_id && result.matched_user_id) {
        const match: Match = {
          matchId: result.match_id,
          matchedUserId: result.matched_user_id,
          instagramHandle: result.instagram_handle ?? undefined,
          createdAt: new Date().toISOString(),
          seen: true,
        };
        useEchoStore.getState().addMatch(match);
        return { status: "already_matched", match };
      }
      return { status: "already_matched" };
    }

    if (result.status === "error" && result.reason === "rate_limited") {
      return { status: "rate_limited" };
    }

    return { status: "error" };
  } catch (error) {
    logger.error("Wave error", error);
    return { status: "error" };
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

    const { data, error } = await supabase.functions.invoke("send-wave", {
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

    // Check the response data for undo_expired — supabase.functions.invoke
    // treats non-5xx as success, so a 400 response with undo_expired
    // comes back as `data`, not `error` (C8 fix)
    const result = data as { status?: string; reason?: string } | null;
    if (result?.status === "error" && result?.reason === "undo_expired") {
      logger.echo("Undo failed: wave already consumed or expired");
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
