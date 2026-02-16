-- 00009: Fix race condition in reciprocal wave detection + add periodic cleanup

-- =============================================================================
-- 1) Fix match race condition: add FOR UPDATE to prevent two simultaneous waves
--    from both reading "no reciprocal" and both returning 'pending'.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_and_create_match(
  p_waver_id UUID,
  p_target_token VARCHAR(16)
)
RETURNS jsonb AS $$
DECLARE
  v_target_user_id UUID;
  v_reciprocal_wave_id UUID;
  v_match_id UUID;
  v_recent_wave_count INT;
BEGIN
  -- Rate limit: max 20 waves per minute per user
  SELECT COUNT(*) INTO v_recent_wave_count
  FROM public.waves
  WHERE waver_user_id = p_waver_id
    AND created_at > now() - interval '1 minute';

  IF v_recent_wave_count >= 20 THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'rate_limited');
  END IF;

  -- Step 1: Resolve target token to user ID
  SELECT user_id INTO v_target_user_id
  FROM public.ephemeral_ids
  WHERE token = p_target_token
    AND is_active = true
    AND expires_at > now();

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_or_expired_token');
  END IF;

  -- Prevent self-wave
  IF v_target_user_id = p_waver_id THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'self_wave');
  END IF;

  -- Step 2: Check if target has already waved at the waver
  -- FOR UPDATE locks the row to prevent two simultaneous waves both reading
  -- "no reciprocal" and both returning 'pending' instead of creating a match.
  SELECT w.id INTO v_reciprocal_wave_id
  FROM public.waves w
  JOIN public.ephemeral_ids e ON w.target_ephemeral_token = e.token
  WHERE w.waver_user_id = v_target_user_id
    AND e.user_id = p_waver_id
    AND e.is_active = true
    AND w.is_consumed = false
    AND w.expires_at > now()
  LIMIT 1
  FOR UPDATE OF w;

  -- Step 3: Record the wave (ON CONFLICT handles duplicate waves)
  INSERT INTO public.waves (waver_user_id, target_ephemeral_token, expires_at)
  VALUES (p_waver_id, p_target_token, now() + INTERVAL '15 minutes')
  ON CONFLICT DO NOTHING;

  -- Step 4: If reciprocal wave exists, create a match
  IF v_reciprocal_wave_id IS NOT NULL THEN
    -- Mark the reciprocal wave as consumed
    UPDATE public.waves SET is_consumed = true
    WHERE id = v_reciprocal_wave_id;

    -- Mark our wave as consumed too
    UPDATE public.waves SET is_consumed = true
    WHERE waver_user_id = p_waver_id
      AND target_ephemeral_token = p_target_token
      AND is_consumed = false;

    -- Create match (ordered pair for uniqueness)
    INSERT INTO public.matches (user_a, user_b)
    VALUES (
      LEAST(p_waver_id, v_target_user_id),
      GREATEST(p_waver_id, v_target_user_id)
    )
    ON CONFLICT (LEAST(user_a, user_b), GREATEST(user_a, user_b)) DO NOTHING
    RETURNING id INTO v_match_id;

    IF v_match_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'match',
        'match_id', v_match_id,
        'matched_user_id', v_target_user_id
      );
    ELSE
      RETURN jsonb_build_object('status', 'already_matched');
    END IF;
  END IF;

  -- No reciprocal wave: pending
  RETURN jsonb_build_object('status', 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 2) Cleanup function: delete expired ephemeral IDs and consumed/expired waves
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Delete expired ephemeral IDs (older than 1 hour past expiry)
  DELETE FROM public.ephemeral_ids
  WHERE expires_at < now() - interval '1 hour';

  -- Delete consumed waves older than 24 hours
  DELETE FROM public.waves
  WHERE is_consumed = true
    AND created_at < now() - interval '24 hours';

  -- Delete expired unconsumed waves older than 1 hour past expiry
  DELETE FROM public.waves
  WHERE is_consumed = false
    AND expires_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 3) Schedule cleanup to run every hour (requires pg_cron extension)
--    Note: pg_cron must be enabled in Supabase Dashboard > Database > Extensions
-- =============================================================================
-- Enable the extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly cleanup
SELECT cron.schedule(
  'cleanup-expired-data',
  '0 * * * *',  -- Every hour at minute 0
  $$SELECT public.cleanup_expired_data()$$
);
