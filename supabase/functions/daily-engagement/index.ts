import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Minimum hours between engagement pushes for the same user.
 *  Set to 24h — broad enough to also suppress after organic wave/match
 *  pushes without needing a separate tracking table. */
const ENGAGEMENT_COOLDOWN_HOURS = 24;

/** Only target users active within this many days */
const ACTIVE_WITHIN_DAYS = 7;

/** Auto-pause after N consecutive sends with no app open */
const MAX_IGNORED_SENDS = 5;

/** Target local hours (inclusive) — 6 PM to 8 PM (sends at 6, 7, 8 PM local) */
const TARGET_HOUR_START = 18;
const TARGET_HOUR_END = 20;

/** Max users per cron run to prevent edge function timeout */
const MAX_ELIGIBLE_USERS = 500;

/** Batch size for Expo Push API */
const EXPO_BATCH_SIZE = 100;

// ─── Notification content variants ─────────────────────────────────
//
// Daily engagement is a re-engagement nudge, NOT a duplicate of organic
// notifications. Waves, matches, and proximity alerts already have their
// own real-time pushes. Daily engagement content is unique and generic —
// designed to remind users to open the app during peak social hours.

interface NotificationContent {
  title: string;
  body: string;
  campaign: string;
}

/** Weekday evening messages — rotated by day of week */
const WEEKDAY_VARIANTS: NotificationContent[] = [
  { title: "Evening plans? ✨", body: "Wave users are most active right now", campaign: "weekday_0" },
  { title: "Who's nearby? 👋", body: "Open Wave and find out", campaign: "weekday_1" },
  { title: "Your evening check-in", body: "See who's around you on Wave", campaign: "weekday_2" },
  { title: "Peak hour on Wave 🔥", body: "More people are nearby right now than usual", campaign: "weekday_3" },
  { title: "Don't miss a connection", body: "Wave users near you are active right now", campaign: "weekday_4" },
];

/** Weekend messages — rotated by hour */
const WEEKEND_VARIANTS: NotificationContent[] = [
  { title: "Out and about? 👋", body: "More people are on Wave during weekends", campaign: "weekend_0" },
  { title: "Weekend vibes ☀️", body: "See who's nearby — open Wave", campaign: "weekend_1" },
  { title: "Perfect time to connect 💫", body: "People near you are on Wave right now", campaign: "weekend_2" },
];

function pickContent(user: EligibleUser): NotificationContent {
  if (user.is_local_weekend) {
    // Rotate weekend variants by current UTC hour to avoid same message every weekend
    const hourIndex = new Date().getUTCHours() % WEEKEND_VARIANTS.length;
    return WEEKEND_VARIANTS[hourIndex];
  }

  // Rotate weekday variants by day of week (Mon=0 through Fri=4)
  const day = new Date().getUTCDay();
  // Map Sun(0)..Sat(6) to 0..4 for weekdays; fallback to 0 for edge cases
  const dayIndex = day >= 1 && day <= 5 ? day - 1 : 0;
  return WEEKDAY_VARIANTS[dayIndex];
}

// ─── Types ─────────────────────────────────────────────────────────

interface EligibleUser {
  user_id: string;
  push_token: string;
  is_local_weekend: boolean;
}

/**
 * Daily Engagement Edge Function
 *
 * Called hourly by pg_cron. For each invocation:
 * 1. Find users whose local time is in the target window (6-9 PM)
 * 2. Filter by activity, cooldowns, and preferences
 * 3. Pick contextual notification content per user
 * 4. Batch send via Expo Push API
 * 5. Record sends for cooldown tracking
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();

    // Step 1: Find eligible users
    const { data: eligible, error: queryError } = await adminClient.rpc(
      "get_engagement_eligible_users",
      {
        p_target_hour_start: TARGET_HOUR_START,
        p_target_hour_end: TARGET_HOUR_END,
        p_active_within_days: ACTIVE_WITHIN_DAYS,
        p_engagement_cooldown_hours: ENGAGEMENT_COOLDOWN_HOURS,
        p_max_ignored_sends: MAX_IGNORED_SENDS,
        p_max_results: MAX_ELIGIBLE_USERS,
      },
    );

    if (queryError) {
      console.error("Failed to query eligible users:", queryError);
      return new Response(
        JSON.stringify({ error: "Query failed", detail: queryError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const users: EligibleUser[] = eligible ?? [];

    if (users.length === 0) {
      console.log("No eligible users for engagement push this hour");
      return new Response(
        JSON.stringify({ status: "ok", eligible: 0, sent: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Found ${users.length} eligible users for engagement push`);

    // Step 2: Build messages with contextual content
    const messages: {
      to: string;
      title: string;
      body: string;
      sound: "default";
      data: Record<string, unknown>;
      priority: "high";
      _userId: string;
      _campaign: string;
    }[] = [];

    for (const user of users) {
      const content = pickContent(user);
      messages.push({
        to: user.push_token,
        title: content.title,
        body: content.body,
        sound: "default",
        data: { type: "engagement" },
        priority: "high",
        _userId: user.user_id,
        _campaign: content.campaign,
      });
    }

    // Step 3: Batch send via Expo Push API
    const sentRecords: { user_id: string; campaign: string }[] = [];
    const invalidTokens: string[] = [];

    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      const expoBatch = batch.map(
        ({ _userId, _campaign, ...msg }) => msg,
      );

      try {
        const pushResponse = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(expoBatch),
        });

        if (pushResponse.ok) {
          const pushData = await pushResponse.json();

          if (pushData.data && Array.isArray(pushData.data)) {
            for (let j = 0; j < pushData.data.length; j++) {
              const ticket = pushData.data[j];
              if (
                ticket.status === "error" &&
                ticket.details?.error === "DeviceNotRegistered"
              ) {
                invalidTokens.push(batch[j].to);
              } else if (ticket.status === "ok") {
                sentRecords.push({
                  user_id: batch[j]._userId,
                  campaign: batch[j]._campaign,
                });
              }
            }
          }
        } else {
          console.error(
            `Expo Push API error (${pushResponse.status}):`,
            await pushResponse.text(),
          );
        }
      } catch (pushErr) {
        console.error("Push send error:", pushErr);
      }
    }

    // Step 4: Record successful sends for cooldown tracking
    if (sentRecords.length > 0) {
      const { error: insertError } = await adminClient
        .from("engagement_notifications")
        .insert(sentRecords);

      if (insertError) {
        console.error("Failed to record engagement sends:", insertError);
      }
    }

    // Step 5: Clean up invalid push tokens
    if (invalidTokens.length > 0) {
      await adminClient
        .from("push_tokens")
        .delete()
        .in("token", invalidTokens);

      console.log(`Cleaned up ${invalidTokens.length} invalid push tokens`);
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `Engagement push complete: ${sentRecords.length}/${users.length} sent in ${elapsed}ms`,
    );

    return new Response(
      JSON.stringify({
        status: "ok",
        eligible: users.length,
        sent: sentRecords.length,
        invalid_tokens: invalidTokens.length,
        elapsed_ms: elapsed,
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
