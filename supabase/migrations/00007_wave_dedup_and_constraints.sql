-- Prevent duplicate waves: one wave per user per target token
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_wave_per_token
  ON public.waves (waver_user_id, target_ephemeral_token)
  WHERE is_consumed = false;

-- Validate instagram_handle format at the DB level
ALTER TABLE public.profiles
  ADD CONSTRAINT valid_instagram_handle
  CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$');

-- Allow users to insert their own profile (self-heal if trigger fails)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
