import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { logger } from "@/utils/logger";

/**
 * Get a fresh Supabase session, refreshing the JWT if it's expired or about to expire.
 * If the refresh token is also expired (stale anonymous session), automatically
 * re-authenticates anonymously so edge function calls never get stuck on Invalid JWT.
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
      logger.error("Session refresh failed, re-authenticating anonymously...", refreshErr);

      // Refresh token is dead — sign out to clear stale session, then re-auth
      await supabase.auth.signOut();
      const { data: newAuth, error: newErr } =
        await supabase.auth.signInAnonymously();

      if (newErr || !newAuth.session) {
        logger.error("Anonymous re-auth failed", newErr);
        return null;
      }

      logger.echo("Re-authenticated anonymously", {
        userId: newAuth.session.user.id,
      });
      return newAuth.session;
    }

    session = refreshed.session;
  }

  return session;
}
