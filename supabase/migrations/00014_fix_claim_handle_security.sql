-- 00014: Fix claim_instagram_handle to only release orphaned handles
--
-- BUG: The previous version unconditionally stripped the handle from ANY
-- other user, allowing handle theft between active users.
--
-- FIX: Only release the handle from profiles whose owning auth.users row
-- no longer exists (truly orphaned from expired anonymous sessions).
-- If the handle belongs to an active user, the unique index will reject
-- the INSERT/UPDATE and the function will raise an exception caught by
-- the client as "handle already taken".

CREATE OR REPLACE FUNCTION public.claim_instagram_handle(p_handle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only release the handle from ORPHANED profiles (auth user deleted/expired)
  UPDATE profiles
  SET instagram_handle = NULL
  WHERE LOWER(instagram_handle) = LOWER(p_handle)
    AND id != auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM auth.users WHERE auth.users.id = profiles.id
    );

  -- Upsert the current user's profile with the claimed handle.
  -- If another active user owns it, the unique index on
  -- LOWER(instagram_handle) will cause this to fail, which is correct.
  INSERT INTO profiles (id, instagram_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET instagram_handle = p_handle;
END;
$$;
