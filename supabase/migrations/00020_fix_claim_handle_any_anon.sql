-- 00020: Fix claim_instagram_handle – release from ANY anonymous user
--
-- After app reinstall the user gets a new anonymous user ID.
-- The previous version only released handles from anonymous users
-- inactive for 30+ days, which doesn't cover a same-day reinstall.
-- Now we release the handle from ANY other anonymous user,
-- regardless of how recently they were active.

CREATE OR REPLACE FUNCTION public.claim_instagram_handle(p_handle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Release handle from:
  -- 1. Orphaned profiles (auth user deleted/expired)
  -- 2. ANY other anonymous user (covers reinstall scenario)
  UPDATE profiles
  SET instagram_handle = NULL
  WHERE LOWER(instagram_handle) = LOWER(p_handle)
    AND id != auth.uid()
    AND (
      -- Truly orphaned: no auth.users row exists
      NOT EXISTS (
        SELECT 1 FROM auth.users WHERE auth.users.id = profiles.id
      )
      OR
      -- Any anonymous user (not just stale ones)
      EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = profiles.id
          AND u.is_anonymous = true
      )
    );

  -- Upsert the current user's profile with the claimed handle.
  INSERT INTO profiles (id, instagram_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET instagram_handle = p_handle;
END;
$$;
