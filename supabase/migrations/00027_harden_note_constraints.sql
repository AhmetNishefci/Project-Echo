-- Add CHECK constraint to ephemeral_ids.note to match profiles.note (max 40 chars).
ALTER TABLE ephemeral_ids
  ADD CONSTRAINT ephemeral_ids_note_length CHECK (char_length(note) <= 40);

-- Recreate update_active_note with input validation and empty-string normalization.
CREATE OR REPLACE FUNCTION public.update_active_note(p_note TEXT)
RETURNS void AS $$
BEGIN
  -- Reject notes exceeding the 40-character limit
  IF p_note IS NOT NULL AND char_length(p_note) > 40 THEN
    RAISE EXCEPTION 'Note exceeds 40 character limit';
  END IF;

  UPDATE public.ephemeral_ids
  SET note = NULLIF(p_note, '')
  WHERE user_id = auth.uid()
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
