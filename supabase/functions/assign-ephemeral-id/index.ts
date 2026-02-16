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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client with the user's JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Get the authenticated user
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

    const userId = user.id;

    // Ensure profile exists (handles case where trigger hasn't fired)
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          is_anonymous: user.is_anonymous ?? true,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      console.error("Failed to ensure profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to ensure profile", details: profileError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Deactivate existing active tokens for this user
    await adminClient
      .from("ephemeral_ids")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    // Generate a new random 8-byte token (16 hex characters)
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Insert new ephemeral ID
    const { data, error: insertError } = await adminClient
      .from("ephemeral_ids")
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert ephemeral ID:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate token" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        token: data.token,
        expires_at: data.expires_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
