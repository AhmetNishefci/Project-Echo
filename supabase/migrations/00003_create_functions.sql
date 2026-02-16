-- Project Echo: Core matching function
-- Atomically checks for reciprocal waves and creates matches

CREATE OR REPLACE FUNCTION public.check_and_create_match(
  p_waver_id UUID,
  p_target_token VARCHAR(16)
)
RETURNS jsonb AS $$
DECLARE
  v_target_user_id UUID;
  v_reciprocal_wave_id UUID;
  v_match_id UUID;
BEGIN
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
  -- (target waved at any of the waver's active tokens)
  SELECT w.id INTO v_reciprocal_wave_id
  FROM public.waves w
  JOIN public.ephemeral_ids e ON w.target_ephemeral_token = e.token
  WHERE w.waver_user_id = v_target_user_id
    AND e.user_id = p_waver_id
    AND e.is_active = true
    AND w.is_consumed = false
    AND w.expires_at > now()
  LIMIT 1;

  -- Step 3: Record the wave
  INSERT INTO public.waves (waver_user_id, target_ephemeral_token, expires_at)
  VALUES (p_waver_id, p_target_token, now() + INTERVAL '15 minutes');

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
