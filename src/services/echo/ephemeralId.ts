import { supabase } from "../supabase";
import { useEchoStore } from "@/stores/echoStore";
import { logger } from "@/utils/logger";
import { getFreshSession } from "./session";

interface TokenResponse {
  token: string;
  expires_at: string;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2_000;

/**
 * Fetch a new ephemeral token from the server.
 * Retries up to 3 times with exponential backoff on failure.
 */
export async function fetchNewToken(): Promise<TokenResponse | null> {
  useEchoStore.getState().setRotating(true);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await attemptFetchToken();
      if (result) {
        useEchoStore.getState().setRotating(false);
        return result;
      }
    } catch (error) {
      logger.error(
        `Token fetch attempt ${attempt + 1}/${MAX_RETRIES + 1} failed`,
        error,
      );
    }

    // Don't delay after the last attempt
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      logger.echo(`Retrying token fetch in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  logger.error("All token fetch attempts failed");
  useEchoStore.getState().setRotating(false);
  return null;
}

async function attemptFetchToken(): Promise<TokenResponse | null> {
  const session = await getFreshSession();

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
    let details = "";
    try {
      if ("context" in error && (error as any).context?.json) {
        details = JSON.stringify(await (error as any).context.json());
      } else if ("context" in error && (error as any).context?.text) {
        details = await (error as any).context.text();
      }
    } catch {
      // context may already be consumed; fall back to error message
      details = (error as any)?.message ?? "";
    }

    // Check for Invalid JWT in the error context OR in the error message/name
    const errorStr = details + " " + String(error);
    const isJwtError =
      errorStr.includes("Invalid JWT") ||
      errorStr.includes("401") ||
      errorStr.includes("Unauthorized");

    if (isJwtError) {
      logger.echo("Server rejected JWT — forcing re-auth");
      await supabase.auth.signOut();
      const { data: newAuth, error: reAuthErr } =
        await supabase.auth.signInAnonymously();
      if (!reAuthErr && newAuth.session) {
        logger.echo("Re-authenticated anonymously", {
          userId: newAuth.session.user.id,
        });
        // Retry immediately with the new session
        const retryResult = await supabase.functions.invoke(
          "assign-ephemeral-id",
          {
            headers: {
              Authorization: `Bearer ${newAuth.session.access_token}`,
            },
          },
        );
        if (!retryResult.error) {
          const result = retryResult.data as TokenResponse;
          const expiresAtMs = new Date(result.expires_at).getTime();
          useEchoStore.getState().setToken(result.token, expiresAtMs);
          logger.echo("New ephemeral token assigned after re-auth", {
            token: result.token.substring(0, 8),
            expiresAt: result.expires_at,
          });
          return result;
        }
        logger.error("Retry after re-auth also failed", retryResult.error);
      } else {
        logger.error("Anonymous re-auth failed", reAuthErr);
      }
    }

    logger.error(
      "Failed to fetch ephemeral token: " + (details || "no details"),
      error,
    );
    throw error; // Throw so retry loop catches it
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
}
