-- 00038: Add local_dow to engagement eligible RPC return type
--
-- The original 00036 RPC only returned is_local_weekend.
-- The edge function needs the actual local day-of-week to pick
-- the correct weekday variant per user's timezone (not server UTC).
--
-- PostgreSQL cannot change return type with CREATE OR REPLACE,
-- so we must DROP first (safe — no dependent objects).

DROP FUNCTION IF EXISTS public.get_engagement_eligible_users(INT, INT, INT, INT, INT, INT);

CREATE OR REPLACE FUNCTION public.get_engagement_eligible_users(
  p_target_hour_start INT,
  p_target_hour_end INT,
  p_active_within_days INT,
  p_engagement_cooldown_hours INT,
  p_max_ignored_sends INT,
  p_max_results INT DEFAULT 500
)
RETURNS TABLE (
  user_id UUID,
  push_token TEXT,
  is_local_weekend BOOLEAN,
  local_dow INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  valid_timezones AS (
    SELECT name FROM pg_timezone_names
  ),

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
      AND EXTRACT(HOUR FROM now() AT TIME ZONE p.timezone)
          BETWEEN p_target_hour_start AND p_target_hour_end
    ORDER BY p.id, pt.updated_at DESC
  ),

  no_recent_engagement AS (
    SELECT be.uid, be.ptoken, be.tz, be.last_active_at
    FROM base_eligible be
    WHERE NOT EXISTS (
      SELECT 1 FROM public.engagement_notifications en
      WHERE en.user_id = be.uid
        AND en.sent_at > now() - make_interval(hours => p_engagement_cooldown_hours)
    )
  ),

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
    EXTRACT(DOW FROM now() AT TIME ZONE ni.tz) IN (0, 6) AS is_local_weekend,
    EXTRACT(DOW FROM now() AT TIME ZONE ni.tz)::INT AS local_dow
  FROM not_ignoring ni
  LIMIT p_max_results;
END;
$$;
