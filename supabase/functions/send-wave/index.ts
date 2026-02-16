import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { target_ephemeral_token, action } = await req.json();

    if (
      !target_ephemeral_token ||
      typeof target_ephemeral_token !== "string" ||
      target_ephemeral_token.length !== 16
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid target_ephemeral_token" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Admin client to bypass RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ─── UNDO WAVE ───────────────────────────────────────────────
    if (action === "undo") {
      // Resolve target token → user_id
      const { data: tokenRow } = await adminClient
        .from("ephemeral_ids")
        .select("user_id")
        .eq("token", target_ephemeral_token)
        .or("is_active.eq.true,expires_at.gt.now()")
        .limit(1)
        .maybeSingle();

      // Delete the wave record (only if it hasn't been consumed/matched
      // and was created within the last 60 seconds)
      const { error: delError } = await adminClient
        .from("waves")
        .delete()
        .eq("waver_user_id", user.id)
        .eq("target_ephemeral_token", target_ephemeral_token)
        .eq("is_consumed", false)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());

      if (delError) {
        console.error("Undo wave delete error:", delError);
        return new Response(JSON.stringify({ status: "error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Broadcast wave_undo to the target user so their counter decrements
      if (tokenRow?.user_id) {
        try {
          await adminClient.channel(`user:${tokenRow.user_id}`).send({
            type: "broadcast",
            event: "wave_undo",
            payload: {},
          });
        } catch (err) {
          console.error("wave_undo broadcast failed:", err);
        }
      }

      return new Response(JSON.stringify({ status: "undone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SEND WAVE ───────────────────────────────────────────────
    // Call the matching function
    const { data, error: rpcError } = await adminClient.rpc(
      "check_and_create_match",
      {
        p_waver_id: user.id,
        p_target_token: target_ephemeral_token,
      },
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(JSON.stringify({ error: "Match check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = data as {
      status: string;
      match_id?: string;
      matched_user_id?: string;
      target_user_id?: string;
      reason?: string;
    };

    // ─── PENDING WAVE → notify target anonymously ────────────────
    if (result.status === "pending") {
      // Resolve target token → user_id so we can broadcast
      let targetUserId = result.target_user_id;
      if (!targetUserId) {
        const { data: tokenRow } = await adminClient
          .from("ephemeral_ids")
          .select("user_id")
          .eq("token", target_ephemeral_token)
          .or("is_active.eq.true,expires_at.gt.now()")
          .limit(1)
          .maybeSingle();
        targetUserId = tokenRow?.user_id;
      }

      if (targetUserId) {
        try {
          await adminClient.channel(`user:${targetUserId}`).send({
            type: "broadcast",
            event: "wave",
            payload: { t: Date.now() },
          });
        } catch (err) {
          console.error("Wave broadcast to target failed:", err);
        }
      }
    }

    // ─── MATCH → broadcast + push ───────────────────────────────
    let matchedInstagramHandle: string | null = null;

    if (result.status === "match" && result.matched_user_id) {
      // Look up Instagram handles for both users
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, instagram_handle")
        .in("id", [user.id, result.matched_user_id]);

      const waverHandle =
        profiles?.find((p: any) => p.id === user.id)?.instagram_handle ?? null;
      matchedInstagramHandle =
        profiles?.find((p: any) => p.id === result.matched_user_id)
          ?.instagram_handle ?? null;

      const matchPayload = {
        match_id: result.match_id,
        created_at: new Date().toISOString(),
      };

      // Broadcast match event to the OTHER user only
      // (the waver already gets the match from the HTTP response)
      await adminClient.channel(`user:${result.matched_user_id}`).send({
        type: "broadcast",
        event: "match",
        payload: {
          ...matchPayload,
          matched_user_id: user.id,
          instagram_handle: waverHandle,
        },
      });

      // Send push notifications to both users
      await sendMatchPushNotifications(adminClient, [
        {
          userId: user.id,
          matchedUserId: result.matched_user_id,
          matchId: result.match_id!,
          createdAt: matchPayload.created_at,
          instagramHandle: matchedInstagramHandle,
        },
        {
          userId: result.matched_user_id,
          matchedUserId: user.id,
          matchId: result.match_id!,
          createdAt: matchPayload.created_at,
          instagramHandle: waverHandle,
        },
      ]);
    }

    return new Response(JSON.stringify({
      ...result,
      ...(result.status === "match" ? { instagram_handle: matchedInstagramHandle } : {}),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// --- Push notification helpers ---

interface MatchPushTarget {
  userId: string;
  matchedUserId: string;
  matchId: string;
  createdAt: string;
  instagramHandle: string | null;
}

/**
 * Send APNs push notifications to users involved in a match.
 * Uses native APNs HTTP/2 API via Supabase's built-in APNs integration.
 */
async function sendMatchPushNotifications(
  adminClient: ReturnType<typeof createClient>,
  targets: MatchPushTarget[],
): Promise<void> {
  for (const target of targets) {
    try {
      // Look up push token for this user
      const { data: tokenRows, error } = await adminClient
        .from("push_tokens")
        .select("token, platform")
        .eq("user_id", target.userId);

      if (error || !tokenRows || tokenRows.length === 0) {
        console.log(`No push token for user ${target.userId}, skipping`);
        continue;
      }

      for (const row of tokenRows) {
        if (row.platform === "ios") {
          await sendApnsPush(row.token, target);
        }
        // Android FCM can be added later
      }
    } catch (err) {
      console.error(`Push notification failed for ${target.userId}:`, err);
    }
  }
}

/**
 * Send an APNs push notification using HTTP/2 API.
 * Requires APNs auth key to be configured as environment variables.
 */
async function sendApnsPush(
  deviceToken: string,
  target: MatchPushTarget,
): Promise<void> {
  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
  const apnsPrivateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = "com.ahmetnishefci.echo";

  if (!apnsKeyId || !apnsTeamId || !apnsPrivateKey) {
    console.log("APNs credentials not configured, skipping push");
    return;
  }

  try {
    // Create JWT for APNs authentication
    const jwt = await createApnsJwt(apnsKeyId, apnsTeamId, apnsPrivateKey);

    const isProduction = Deno.env.get("APNS_PRODUCTION") === "true";
    const apnsHost = isProduction
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";

    const payload = {
      aps: {
        alert: {
          title: "It's a Match! 🎉",
          body: "Someone waved back at you! Open Echo to see your match.",
        },
        sound: "default",
        badge: 1,
        "mutable-content": 1,
      },
      type: "match",
      match_id: target.matchId,
      matched_user_id: target.matchedUserId,
      created_at: target.createdAt,
    };

    const response = await fetch(
      `${apnsHost}/3/device/${deviceToken}`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": "0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`APNs error (${response.status}):`, body);
    } else {
      console.log(`Push sent to device ${deviceToken.substring(0, 8)}...`);
    }
  } catch (err) {
    console.error("APNs send failed:", err);
  }
}

/**
 * Create a JWT for APNs authentication (ES256 / P-256).
 */
async function createApnsJwt(
  keyId: string,
  teamId: string,
  privateKeyPem: string,
): Promise<string> {
  // Header
  const header = { alg: "ES256", kid: keyId };
  // Claims (valid for 1 hour)
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  // Import private key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  // Sign
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  // Convert DER signature to raw r||s format for JWT
  const signature = derToRaw(new Uint8Array(signatureBuffer));
  const encodedSignature = base64url(signature);

  return `${signingInput}.${encodedSignature}`;
}

function base64url(input: string | Uint8Array): string {
  let b64: string;
  if (typeof input === "string") {
    b64 = btoa(input);
  } else {
    b64 = btoa(String.fromCharCode(...input));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s (64 bytes).
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  const raw = new Uint8Array(64);
  let offset = 2; // skip 0x30 <len>

  // Read r
  offset += 1; // skip 0x02
  const rLen = der[offset++];
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rDest = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, offset + rLen), rDest);
  offset += rLen;

  // Read s
  offset += 1; // skip 0x02
  const sLen = der[offset++];
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sDest = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, offset + sLen), sDest);

  return raw;
}
