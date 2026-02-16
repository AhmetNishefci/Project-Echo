-- 00016: Return match details on already_matched
--
-- When two users who are already matched wave at each other again,
-- return the existing match_id and matched_user_id so the client
-- can re-populate the match in local history (e.g., after user
-- cleared their match history).

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
  v_lock_key BIGINT;
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

  -- Step 3: Check if already matched BEFORE inserting wave
  SELECT id INTO v_match_id
  FROM public.matches
  WHERE user_a = LEAST(p_waver_id, v_target_user_id)
    AND user_b = GREATEST(p_waver_id, v_target_user_id);

  IF v_match_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_matched',
      'match_id', v_match_id,
      'matched_user_id', v_target_user_id
    );
  END IF;

  -- Step 4: Insert the wave (no existing match)
  INSERT INTO public.waves (waver_user_id, target_ephemeral_token, expires_at)
  VALUES (p_waver_id, p_target_token, now() + INTERVAL '15 minutes')
  ON CONFLICT DO NOTHING;

  -- Step 5: Check if target has already waved at the waver
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

  -- Step 5: If reciprocal wave exists, create a match
  IF v_reciprocal_wave_id IS NOT NULL THEN
    UPDATE public.waves SET is_consumed = true WHERE id = v_reciprocal_wave_id;
    UPDATE public.waves SET is_consumed = true
    WHERE waver_user_id = p_waver_id
      AND target_ephemeral_token = p_target_token
      AND is_consumed = false;

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
      -- Match already exists — look up the existing row and return details
      -- so the client can re-populate local match history if it was cleared
      SELECT id INTO v_match_id
      FROM public.matches
      WHERE user_a = LEAST(p_waver_id, v_target_user_id)
        AND user_b = GREATEST(p_waver_id, v_target_user_id);

      RETURN jsonb_build_object(
        'status', 'already_matched',
        'match_id', v_match_id,
        'matched_user_id', v_target_user_id
      );
    END IF;
  END IF;

  -- No reciprocal wave: pending
  RETURN jsonb_build_object('status', 'pending', 'target_user_id', v_target_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
