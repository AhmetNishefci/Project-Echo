import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { logger } from "@/utils/logger";

/**
 * Get a fresh Supabase session, verifying the JWT with the server first.
 * If the token is invalid or expired, it will be auto-refreshed.
 * If the refresh token is also expired, returns null — the caller should
 * treat this as "unauthenticated" and the app will redirect to login.
 */
export async function getFreshSession(): Promise<Session | null> {
  // Verify the JWT with the server — this triggers auto-refresh if needed
  const { error: userError } = await supabase.auth.getUser();

  if (userError) {
    logger.error("Session verification failed, attempting refresh", userError);
    const { data: refreshed, error: refreshErr } =
      await supabase.auth.refreshSession();

    if (refreshErr || !refreshed.session) {
      logger.error("Session refresh failed — user must re-authenticate", refreshErr);
      return null;
    }

    return refreshed.session;
  }

  // Token is valid — read the (now-verified) session from cache
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}
