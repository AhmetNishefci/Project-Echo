import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/**
 * Lightweight redirect endpoint for Instagram OAuth.
 *
 * Instagram requires an HTTPS redirect URI. This function receives the
 * callback from Instagram (with ?code=...) and issues a 302 redirect
 * to the app's custom scheme (wave://auth?code=...) so that
 * ASWebAuthenticationSession / expo-web-browser can catch it.
 */
serve((req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorReason = url.searchParams.get("error_reason");

  let appUrl: string;

  if (code) {
    appUrl = `wave://auth?code=${encodeURIComponent(code)}`;
  } else {
    // User denied or something went wrong
    const errMsg = errorReason || error || "unknown";
    appUrl = `wave://auth?error=${encodeURIComponent(errMsg)}`;
  }

  return new Response(null, {
    status: 302,
    headers: { Location: appUrl },
  });
});
