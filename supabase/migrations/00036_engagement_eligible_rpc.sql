-- 00036: RPC function to find users eligible for daily engagement push
--
-- Called hourly by the daily-engagement edge function.
-- Returns users whose local time is in the target window and who
-- pass all cooldown / activity / preference checks.
--
-- Content selection is purely time-based (weekend vs weekday evening).
-- Wave, match, and proximity events already have their own real-time
-- push notifications — daily engagement is a separate re-engagement nudge.

-- Index for the active-within-N-days filter
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON public.profiles (last_active_at DESC)
  WHERE last_active_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_engagement_eligible_users(
  p_target_hour_start INT,     -- e.g. 18 (6 PM)
  p_target_hour_end INT,       -- e.g. 20 (8 PM, inclusive)
  p_active_within_days INT,    -- e.g. 7
  p_engagement_cooldown_hours INT,  -- e.g. 24
  p_max_ignored_sends INT,     -- e.g. 5
  p_max_results INT DEFAULT 500
)
RETURNS TABLE (
  user_id UUID,
  push_token TEXT,
  is_local_weekend BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Valid IANA timezone names from PostgreSQL catalog
  valid_timezones AS (
    SELECT name FROM pg_timezone_names
  ),

  -- Users with valid timezone, push token, opted in, recently active
  -- DISTINCT ON (p.id) picks one token per user, preferring most recent
  base_eligible AS (
    SELECT DISTINCT ON (p.id)
      p.id AS uid,
      pt.token AS ptoken,
      p.timezone AS tz,
      p.last_active_at
    FROM public.profiles p
    INNER JOIN public.push_tokens pt ON pt.user_id = p.id
    INNER JOIN valid_timezones vt ON vt.name = p.timezone
    WHERE
      p.daily_pushes_enabled = true
      AND p.timezone IS NOT NULL
      AND p.last_active_at IS NOT NULL
      AND p.last_active_at > now() - make_interval(days => p_active_within_days)
      -- Local hour is in target window (safe — timezone validated via JOIN)
      AND EXTRACT(HOUR FROM now() AT TIME ZONE p.timezone)
          BETWEEN p_target_hour_start AND p_target_hour_end
    ORDER BY p.id, pt.updated_at DESC
  ),

  -- Filter out users who received an engagement push recently
  no_recent_engagement AS (
    SELECT be.uid, be.ptoken, be.tz, be.last_active_at
    FROM base_eligible be
    WHERE NOT EXISTS (
      SELECT 1 FROM public.engagement_notifications en
      WHERE en.user_id = be.uid
        AND en.sent_at > now() - make_interval(hours => p_engagement_cooldown_hours)
    )
  ),

  -- Auto-pause: skip users who received N+ engagement sends
  -- since their last app open (they're ignoring us)
  not_ignoring AS (
    SELECT nre.uid, nre.ptoken, nre.tz
    FROM no_recent_engagement nre
    WHERE (
      SELECT COUNT(*) FROM public.engagement_notifications en
      WHERE en.user_id = nre.uid
        AND en.sent_at > nre.last_active_at
    ) < p_max_ignored_sends
  )

  SELECT
    ni.uid AS user_id,
    ni.ptoken AS push_token,
    -- Weekend detection in user's local timezone
    EXTRACT(DOW FROM now() AT TIME ZONE ni.tz) IN (0, 6) AS is_local_weekend
  FROM not_ignoring ni
  LIMIT p_max_results;
END;
$$;
