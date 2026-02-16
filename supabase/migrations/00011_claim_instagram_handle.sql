-- Allow users to claim/reclaim Instagram handles.
-- When an anonymous session expires and a new anonymous user is created,
-- the orphaned profile still holds the handle. This function releases it
-- and assigns the handle to the calling user atomically.

CREATE OR REPLACE FUNCTION public.claim_instagram_handle(p_handle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Release the handle from any OTHER user's profile
  UPDATE profiles
  SET instagram_handle = NULL
  WHERE LOWER(instagram_handle) = LOWER(p_handle)
    AND id != auth.uid();

  -- Upsert the current user's profile with the claimed handle
  INSERT INTO profiles (id, instagram_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET instagram_handle = p_handle;
END;
$$;
