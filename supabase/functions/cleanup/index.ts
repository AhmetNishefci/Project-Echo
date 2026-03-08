import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cleanup Edge Function
 *
 * Calls the cleanup_expired_data() SQL function to remove:
 * - Expired ephemeral IDs (>1 hour past expiry)
 * - Consumed waves (>24 hours old)
 * - Expired unconsumed waves (>1 hour past expiry)
 *
 * Schedule this function to run hourly via:
 *   Supabase Dashboard → Edge Functions → cleanup → Schedule → "0 * * * *"
 *
 * Or invoke manually:
 *   curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup
 */
serve(async (req: Request) => {
  try {
    // Basic auth check: require the service role key or anon key (M18 fix)
    const authHeader = req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const token = authHeader?.replace("Bearer ", "") ?? "";
    if (token !== anonKey && token !== serviceKey) {
      return new Response(
        JSON.stringify({ status: "error", message: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
    );

    const { error } = await adminClient.rpc("cleanup_expired_data");

    if (error) {
      console.error("Cleanup failed:", error);
      return new Response(
        JSON.stringify({ status: "error", message: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log("Cleanup completed successfully");
    return new Response(
      JSON.stringify({ status: "ok", cleaned_at: new Date().toISOString() }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Cleanup unexpected error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
