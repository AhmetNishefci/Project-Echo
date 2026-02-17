-- 00019: Fix claim_instagram_handle for stale anonymous users
--
-- When a user reinstalls the app, they get a new anonymous user ID.
-- The old anonymous user still exists in auth.users but is stale.
-- This update also releases handles from anonymous users who haven't
-- been active in 30 days (their sessions are expired/stale).

CREATE OR REPLACE FUNCTION public.claim_instagram_handle(p_handle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Release handle from:
  -- 1. Orphaned profiles (auth user deleted/expired)
  -- 2. Stale anonymous users inactive for 30+ days
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
      -- Stale anonymous user: is_anonymous and no activity in 30 days
      EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = profiles.id
          AND u.is_anonymous = true
          AND COALESCE(u.last_sign_in_at, u.created_at) < NOW() - INTERVAL '30 days'
      )
    );

  -- Upsert the current user's profile with the claimed handle.
  INSERT INTO profiles (id, instagram_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET instagram_handle = p_handle;
END;
$$;
