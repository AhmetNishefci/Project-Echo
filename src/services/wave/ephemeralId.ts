import { supabase } from "../supabase";
import { useWaveStore } from "@/stores/waveStore";
import { useAuthStore } from "@/stores/authStore";
import { getFreshSession } from "./session";
import { logger } from "@/utils/logger";
import type { Gender } from "@/types";

interface TokenResponse {
  token: string;
  expires_at: string;
  gender: Gender | null;
  note: string | null;
  age: number | null;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2_000;

/**
 * Fetch a new ephemeral token from the server.
 * Retries up to 3 times with exponential backoff on failure.
 */
export async function fetchNewToken(): Promise<TokenResponse | null> {
  useWaveStore.getState().setRotating(true);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await attemptFetchToken();
      if (result) {
        useWaveStore.getState().setRotating(false);
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
      logger.wave(`Retrying token fetch in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  logger.error("All token fetch attempts failed");
  useWaveStore.getState().setRotating(false);
  return null;
}

async function attemptFetchToken(): Promise<TokenResponse | null> {
  const session = await getFreshSession();

  if (!session) {
    logger.error("Cannot fetch token: no valid session");
    return null;
  }

  const { data, error } = await supabase.functions.invoke(
    "assign-ephemeral-id",
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
      details = (error as any)?.message ?? "";
    }

    logger.error(
      "Failed to fetch ephemeral token: " + (details || "no details"),
      error,
    );
    throw error;
  }

  const result = data as TokenResponse;

  // Update store
  const expiresAtMs = new Date(result.expires_at).getTime();
  useWaveStore.getState().setToken(result.token, expiresAtMs);

  // Sync gender and age from server (keeps authStore in sync during rotations)
  if (result.gender) {
    useAuthStore.getState().setGender(result.gender);
  }
  useAuthStore.getState().setAge(result.age ?? null);

  // Sync note from server
  useAuthStore.getState().setNote(result.note ?? null);

  logger.wave("New ephemeral token assigned", {
    token: result.token.substring(0, 8),
    expiresAt: result.expires_at,
  });

  return result;
}
