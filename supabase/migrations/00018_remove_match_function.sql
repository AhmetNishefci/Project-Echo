-- 00018: Server-side match removal
--
-- Allows either user in a match to permanently delete the match.
-- Both users lose it from history and can re-match by waving again.

CREATE OR REPLACE FUNCTION public.remove_match(
  p_user_id UUID,
  p_match_id UUID
)
RETURNS jsonb AS $$
DECLARE
  v_other_user_id UUID;
BEGIN
  -- Find the match and verify the requesting user is part of it
  SELECT
    CASE
      WHEN user_a = p_user_id THEN user_b
      WHEN user_b = p_user_id THEN user_a
      ELSE NULL
    END INTO v_other_user_id
  FROM public.matches
  WHERE id = p_match_id;

  IF v_other_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'not_found');
  END IF;

  -- Delete the match row
  DELETE FROM public.matches WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'status', 'removed',
    'other_user_id', v_other_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
