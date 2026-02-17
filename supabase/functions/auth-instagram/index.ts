import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INSTAGRAM_APP_ID = Deno.env.get("INSTAGRAM_APP_ID") ?? "";
const INSTAGRAM_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri } = await req.json();

    if (!code || typeof code !== "string") {
      return jsonResponse({ error: "Missing authorization code" }, 400);
    }

    if (!redirect_uri || typeof redirect_uri !== "string") {
      return jsonResponse({ error: "Missing redirect_uri" }, 400);
    }

    // ─── Step 1: Exchange authorization code for short-lived token ───
    const tokenFormData = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri,
      code,
    });

    const tokenRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenFormData.toString(),
      },
    );

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Instagram token exchange failed:", errBody);
      return jsonResponse(
        { error: "Instagram token exchange failed" },
        401,
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const igUserId: string = String(tokenData.user_id);

    // ─── Step 2: Fetch Instagram profile ─────────────────────────────
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${accessToken}`,
    );

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      console.error("Instagram profile fetch failed:", errBody);
      return jsonResponse(
        { error: "Failed to fetch Instagram profile" },
        500,
      );
    }

    const profile = await profileRes.json();
    const instagramHandle: string = profile.username;
    const instagramUserId: string = String(profile.user_id ?? igUserId);

    console.log(`Instagram auth: @${instagramHandle} (ID: ${instagramUserId})`);

    // ─── Step 3: Find or create Supabase user ────────────────────────
    // Use a deterministic email so the same Instagram account always maps
    // to the same Supabase user.
    const email = `${instagramUserId}@ig.wave.internal`;

    // Check if a profile with this instagram_user_id already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      // Existing user — update their handle in case it changed on Instagram
      userId = existingProfile.id;
      await adminClient
        .from("profiles")
        .update({ instagram_handle: instagramHandle })
        .eq("id", userId);

      console.log(`Existing user found: ${userId}`);
    } else {
      // New user — create Supabase auth user + profile
      const { data: newUser, error: createErr } =
        await adminClient.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            instagram_user_id: instagramUserId,
            instagram_handle: instagramHandle,
          },
        });

      if (createErr) {
        // User might already exist in auth (e.g., profile row was missing)
        // Try to find by email
        const { data: listData } =
          await adminClient.auth.admin.listUsers();
        const existingAuthUser = listData?.users?.find(
          (u) => u.email === email,
        );

        if (existingAuthUser) {
          userId = existingAuthUser.id;
          console.log(`Auth user existed without profile: ${userId}`);
        } else {
          console.error("Failed to create user:", createErr);
          return jsonResponse({ error: "Failed to create account" }, 500);
        }
      } else {
        userId = newUser.user.id;
        console.log(`New user created: ${userId}`);
      }

      // Ensure profile row exists with Instagram data
      await adminClient.from("profiles").upsert(
        {
          id: userId,
          instagram_handle: instagramHandle,
          instagram_user_id: instagramUserId,
        },
        { onConflict: "id" },
      );
    }

    // ─── Step 4: Generate a magic link token for the client ──────────
    const { data: linkData, error: linkErr } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkErr || !linkData) {
      console.error("Failed to generate magic link:", linkErr);
      return jsonResponse({ error: "Failed to generate session" }, 500);
    }

    // Extract the OTP token from the generated link properties
    const otpToken =
      linkData.properties?.hashed_token ?? "";

    if (!otpToken) {
      console.error("No hashed_token in generated link", linkData);
      return jsonResponse({ error: "Session generation failed" }, 500);
    }

    return jsonResponse({
      email,
      otp_token: otpToken,
      instagram_handle: instagramHandle,
      instagram_user_id: instagramUserId,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
