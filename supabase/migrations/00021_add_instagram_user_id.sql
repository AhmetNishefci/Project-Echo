-- 00021: Add instagram_user_id to profiles for Instagram OAuth
--
-- This column ties a Supabase user to their Instagram identity.
-- The UNIQUE constraint ensures one Instagram account = one Wave user.
-- On each OAuth login, we update the handle from the API response
-- so it stays in sync if the user changes their Instagram username.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_user_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_ig_user_id
  ON public.profiles(instagram_user_id);
