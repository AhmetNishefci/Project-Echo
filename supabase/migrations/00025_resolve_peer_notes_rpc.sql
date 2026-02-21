-- Batch-resolve ephemeral tokens to notes.
-- Returns only tokens that have a non-empty note.
-- SECURITY DEFINER: any authenticated user can resolve tokens discovered via BLE.
CREATE OR REPLACE FUNCTION public.resolve_peer_notes(p_tokens TEXT[])
RETURNS TABLE(token TEXT, note TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT e.token::TEXT, e.note::TEXT
  FROM public.ephemeral_ids e
  WHERE e.token = ANY(p_tokens)
    AND e.is_active = true
    AND e.expires_at > now()
    AND e.note IS NOT NULL
    AND e.note <> '';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
