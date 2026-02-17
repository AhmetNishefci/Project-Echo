import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { logger } from "@/utils/logger";

/**
 * Get a fresh Supabase session, refreshing the JWT if it's expired or about to expire.
 * If the refresh token is also expired, returns null — the caller should
 * treat this as "unauthenticated" and the app will redirect to login.
 */
export async function getFreshSession(): Promise<Session | null> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  // If the access token is expired or about to expire (<60s), refresh it
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 <= Date.now() + 60_000) {
    logger.echo("Access token expired/expiring, refreshing...");
    const { data: refreshed, error: refreshErr } =
      await supabase.auth.refreshSession();

    if (refreshErr || !refreshed.session) {
      logger.error("Session refresh failed — user must re-authenticate", refreshErr);
      return null;
    }

    session = refreshed.session;
  }

  return session;
}
