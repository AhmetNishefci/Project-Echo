-- Add instagram_handle column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN instagram_handle TEXT;

-- Ensure handles are unique (case-insensitive)
CREATE UNIQUE INDEX idx_profiles_instagram_handle
  ON public.profiles (LOWER(instagram_handle))
  WHERE instagram_handle IS NOT NULL;
