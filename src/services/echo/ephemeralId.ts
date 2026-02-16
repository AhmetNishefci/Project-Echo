import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";

interface TokenResponse {
  token: string;
  expires_at: string;
}

/**
 * Fetch a new ephemeral token from the server.
 * Deactivates any existing tokens and assigns a new one.
 */
export async function fetchNewToken(): Promise<TokenResponse | null> {
  try {
    useEchoStore.getState().setRotating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      logger.error("Cannot fetch token: no active session");
      return null;
    }

    const { data, error } = await supabase.functions.invoke(
      "assign-ephemeral-id",
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (error) {
      logger.error("Failed to fetch ephemeral token", error);
      return null;
    }

    const result = data as TokenResponse;

    // Update store
    const expiresAtMs = new Date(result.expires_at).getTime();
    useEchoStore.getState().setToken(result.token, expiresAtMs);

    logger.echo("New ephemeral token assigned", {
      token: result.token.substring(0, 8),
      expiresAt: result.expires_at,
    });

    return result;
  } catch (error) {
    logger.error("Ephemeral token fetch error", error);
    return null;
  } finally {
    useEchoStore.getState().setRotating(false);
  }
}
