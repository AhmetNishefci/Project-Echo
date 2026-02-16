import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import type { WaveResult } from "@/types";
import { logger } from "@/utils/logger";

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

    const {
      data: { session },
    } = await supabase.auth.getSession();

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
      reason?: string;
    };

    logger.echo("Wave result", result);

    if (result.status === "match" && result.match_id && result.matched_user_id) {
      useEchoStore.getState().addMatch({
        matchId: result.match_id,
        matchedUserId: result.matched_user_id,
        createdAt: new Date().toISOString(),
        seen: false,
      });
      return "match";
    }

    if (result.status === "pending") {
      useEchoStore.getState().addPendingWave(targetEphemeralToken);
      return "pending";
    }

    return "error";
  } catch (error) {
    logger.error("Wave error", error);
    return "error";
  } finally {
    useEchoStore.getState().setWaving(false);
  }
}
