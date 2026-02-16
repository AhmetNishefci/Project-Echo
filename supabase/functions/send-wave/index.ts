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
    const { target_ephemeral_token } = await req.json();

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
      reason?: string;
    };

    // If it's a match, broadcast via Supabase Realtime to both users
    if (result.status === "match" && result.matched_user_id) {
      // Broadcast match event to both users via Realtime channels
      const matchPayload = {
        match_id: result.match_id,
        created_at: new Date().toISOString(),
      };

      // Notify the waver
      await adminClient.channel(`user:${user.id}`).send({
        type: "broadcast",
        event: "match",
        payload: {
          ...matchPayload,
          matched_user_id: result.matched_user_id,
        },
      });

      // Notify the matched user
      await adminClient.channel(`user:${result.matched_user_id}`).send({
        type: "broadcast",
        event: "match",
        payload: {
          ...matchPayload,
          matched_user_id: user.id,
        },
      });
    }

    return new Response(JSON.stringify(result), {
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
