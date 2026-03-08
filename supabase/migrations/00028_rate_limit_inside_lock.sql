-- 00028: Move rate limit check INSIDE the advisory lock
--
-- BUG: Rate limit runs before the advisory lock, so rapid concurrent waves
-- from the same user can slip through the rate limit check. By moving it
-- inside the lock, we serialize the count against the actual committed state.
--
-- Also adds the already_matched early check with match details (from 00016/17).

CREATE OR REPLACE FUNCTION public.check_and_create_match(
  p_waver_id UUID,
  p_target_token VARCHAR(16)
)
RETURNS jsonb AS $$
DECLARE
  v_target_user_id UUID;
  v_reciprocal_wave_id UUID;
  v_match_id UUID;
  v_existing_match_id UUID;
  v_recent_wave_count INT;
  v_lock_key BIGINT;
  v_matched_instagram TEXT;
BEGIN
  -- Step 1: Resolve target token to user ID
  SELECT user_id INTO v_target_user_id
  FROM public.ephemeral_ids
  WHERE token = p_target_token
    AND (is_active = true OR expires_at > now());

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_or_expired_token');
  END IF;

  -- Prevent self-wave
  IF v_target_user_id = p_waver_id THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'self_wave');
  END IF;

  -- Step 2: Advisory lock on the ordered user pair
  v_lock_key := hashtext(
    LEAST(p_waver_id::text, v_target_user_id::text) ||
    GREATEST(p_waver_id::text, v_target_user_id::text)
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Step 3: Rate limit INSIDE the lock so concurrent waves are serialized
  SELECT COUNT(*) INTO v_recent_wave_count
  FROM public.waves
  WHERE waver_user_id = p_waver_id
    AND created_at > now() - interval '1 minute';

  IF v_recent_wave_count >= 20 THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'rate_limited');
  END IF;

  -- Step 4: Early check — already matched?
  SELECT m.id INTO v_existing_match_id
  FROM public.matches m
  WHERE m.user_a = LEAST(p_waver_id, v_target_user_id)
    AND m.user_b = GREATEST(p_waver_id, v_target_user_id);

  IF v_existing_match_id IS NOT NULL THEN
    SELECT p.instagram_handle INTO v_matched_instagram
    FROM public.profiles p
    WHERE p.id = v_target_user_id;

    RETURN jsonb_build_object(
      'status', 'already_matched',
      'match_id', v_existing_match_id,
      'matched_user_id', v_target_user_id,
      'instagram_handle', COALESCE(v_matched_instagram, '')
    );
  END IF;

  -- Step 5: Insert the wave FIRST (before checking reciprocals)
  INSERT INTO public.waves (waver_user_id, target_ephemeral_token, expires_at)
  VALUES (p_waver_id, p_target_token, now() + INTERVAL '15 minutes')
  ON CONFLICT DO NOTHING;

  -- Step 6: Check if target has already waved at the waver
  SELECT w.id INTO v_reciprocal_wave_id
  FROM public.waves w
  JOIN public.ephemeral_ids e ON w.target_ephemeral_token = e.token
  WHERE w.waver_user_id = v_target_user_id
    AND e.user_id = p_waver_id
    AND (e.is_active = true OR e.expires_at > now())
    AND w.is_consumed = false
    AND w.expires_at > now()
  LIMIT 1
  FOR UPDATE OF w;

  -- Step 7: If reciprocal wave exists, create a match
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
      -- Fetch matched user's Instagram for the response
      SELECT p.instagram_handle INTO v_matched_instagram
      FROM public.profiles p
      WHERE p.id = v_target_user_id;

      RETURN jsonb_build_object(
        'status', 'match',
        'match_id', v_match_id,
        'matched_user_id', v_target_user_id,
        'instagram_handle', COALESCE(v_matched_instagram, '')
      );
    ELSE
      RETURN jsonb_build_object('status', 'already_matched');
    END IF;
  END IF;

  -- No reciprocal wave: pending
  RETURN jsonb_build_object('status', 'pending', 'target_user_id', v_target_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
