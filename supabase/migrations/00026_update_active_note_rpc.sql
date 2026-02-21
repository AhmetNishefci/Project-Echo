-- Allow an authenticated user to update the note on their active ephemeral token.
-- This enables instant note propagation (no need to wait for token rotation).
CREATE OR REPLACE FUNCTION public.update_active_note(p_note TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.ephemeral_ids
  SET note = p_note
  WHERE user_id = auth.uid()
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
