import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Module-level singleton to reuse across warm invocations
const adminClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

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
      !/^[0-9a-f]{16}$/.test(target_ephemeral_token)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid target_ephemeral_token" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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
      // and was created within the wave lifetime — 15 minutes)
      const { data: deleted, error: delError } = await adminClient
        .from("waves")
        .delete()
        .eq("waver_user_id", user.id)
        .eq("target_ephemeral_token", target_ephemeral_token)
        .eq("is_consumed", false)
        .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
        .select();

      if (delError) {
        console.error("Undo wave delete error:", delError);
        return new Response(JSON.stringify({ status: "error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!deleted || deleted.length === 0) {
        return new Response(JSON.stringify({ status: "error", reason: "undo_expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Broadcast wave_undo to the target user so they remove the waver token
      if (tokenRow?.user_id) {
        // Look up the waver's active ephemeral token
        let waverToken: string | null = null;
        try {
          const { data: waverRow } = await adminClient
            .from("ephemeral_ids")
            .select("token")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          waverToken = waverRow?.token ?? null;
        } catch (err) {
          console.error("Failed to look up waver token for undo:", err);
        }

        try {
          const ch = adminClient.channel(`user:${tokenRow.user_id}`);
          await ch.send({
            type: "broadcast",
            event: "wave_undo",
            payload: { waver_token: waverToken },
          });
          adminClient.removeChannel(ch);
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
        // Look up the waver's active ephemeral token so the target
        // knows which radar peer waved at them
        let waverToken: string | null = null;
        try {
          const { data: waverRow } = await adminClient
            .from("ephemeral_ids")
            .select("token")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          waverToken = waverRow?.token ?? null;
        } catch (err) {
          console.error("Failed to look up waver token:", err);
        }

        try {
          const ch = adminClient.channel(`user:${targetUserId}`);
          await ch.send({
            type: "broadcast",
            event: "wave",
            payload: { t: Date.now(), waver_token: waverToken },
          });
          adminClient.removeChannel(ch);
        } catch (err) {
          console.error("Wave broadcast to target failed:", err);
        }

        // Send push notification to target user
        await sendExpoPush(adminClient, targetUserId, {
          title: "Someone waved at you! 👋",
          body: "Open Wave to wave back",
          data: { type: "wave" },
        });
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
      const matchCh = adminClient.channel(`user:${result.matched_user_id}`);
      await matchCh.send({
        type: "broadcast",
        event: "match",
        payload: {
          ...matchPayload,
          matched_user_id: user.id,
          instagram_handle: waverHandle,
        },
      });
      adminClient.removeChannel(matchCh);

      // Send push notification to the OTHER user
      // (the waver already gets the match from the HTTP response)
      await sendExpoPush(adminClient, result.matched_user_id, {
        title: "It's a Match! 🎉",
        body: "Someone waved back! Open Wave to see who.",
        data: {
          type: "match",
          match_id: result.match_id,
          matched_user_id: user.id,
          instagram_handle: waverHandle,
          created_at: matchPayload.created_at,
        },
      });

      // Also push the waver (in case they backgrounded the app)
      await sendExpoPush(adminClient, user.id, {
        title: "It's a Match! 🎉",
        body: "Someone waved back! Open Wave to see who.",
        data: {
          type: "match",
          match_id: result.match_id,
          matched_user_id: result.matched_user_id,
          instagram_handle: matchedInstagramHandle,
          created_at: matchPayload.created_at,
        },
      });
    }

    // ─── ALREADY MATCHED → return instagram handle so client can re-populate ──
    if (result.status === "already_matched" && result.matched_user_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("instagram_handle")
        .eq("id", result.matched_user_id)
        .single();

      matchedInstagramHandle = profile?.instagram_handle ?? null;
    }

    return new Response(JSON.stringify({
      ...result,
      ...((result.status === "match" || result.status === "already_matched")
        ? { instagram_handle: matchedInstagramHandle } : {}),
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

// --- Expo Push Notification helper ---

/**
 * Send a push notification via Expo Push API.
 * Tokens are stored as Expo Push Tokens (ExponentPushToken[xxx]).
 */
async function sendExpoPush(
  adminClient: ReturnType<typeof createClient>,
  targetUserId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { data: tokenRows } = await adminClient
      .from("push_tokens")
      .select("token")
      .eq("user_id", targetUserId);

    if (!tokenRows || tokenRows.length === 0) {
      console.log(`No push token for user ${targetUserId}, skipping push`);
      return;
    }

    const messages = tokenRows.map((row: { token: string }) => ({
      to: row.token,
      title: notification.title,
      body: notification.body,
      sound: "default" as const,
      data: notification.data ?? {},
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Expo push error (${response.status}):`, body);
    } else {
      const result = await response.json();
      console.log(`Push sent to user ${targetUserId}:`, JSON.stringify(result));

      // Clean up invalid push tokens (H15 fix)
      // Expo returns per-ticket errors for invalid/uninstalled devices
      const tickets = result?.data ?? (Array.isArray(result) ? result : []);
      const tokensToDelete: string[] = [];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered"
        ) {
          tokensToDelete.push(messages[i].to);
        }
      }
      if (tokensToDelete.length > 0) {
        console.log(`Cleaning up ${tokensToDelete.length} invalid push tokens`);
        await adminClient
          .from("push_tokens")
          .delete()
          .in("token", tokensToDelete);
      }
    }
  } catch (err) {
    console.error(`Push notification failed for ${targetUserId}:`, err);
  }
}
