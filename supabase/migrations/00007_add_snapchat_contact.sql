-- 00007: Add Snapchat as a second contact method alongside Instagram.
--
-- Adds snapchat_handle column to profiles with validation, uniqueness,
-- a claim RPC (mirrors claim_instagram_handle), and a new contact handles
-- RPC that returns both Instagram and Snapchat handles for matched users.
-- The old get_matched_instagram_handles RPC is preserved for backward
-- compatibility with any old client versions.

-- 1. Add column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS snapchat_handle text;

-- 2. Validation constraint: Snapchat usernames are 3-15 chars,
--    start with a letter, contain letters/numbers/dots/underscores/hyphens,
--    end with letter or number.
ALTER TABLE public.profiles
  ADD CONSTRAINT valid_snapchat_handle
  CHECK (snapchat_handle IS NULL OR snapchat_handle ~ '^[a-z][a-z0-9._-]{1,13}[a-z0-9]$');

-- 3. Case-insensitive unique index (same pattern as Instagram)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_snapchat_handle
  ON public.profiles (lower(snapchat_handle))
  WHERE (snapchat_handle IS NOT NULL);

-- 4. Claim RPC: atomically release handle from orphaned/anonymous profiles,
--    then assign to the calling user (mirrors claim_instagram_handle exactly).
CREATE OR REPLACE FUNCTION public.claim_snapchat_handle(p_handle text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET snapchat_handle = NULL
  WHERE LOWER(snapchat_handle) = LOWER(p_handle)
    AND id != auth.uid()
    AND (
      NOT EXISTS (
        SELECT 1 FROM auth.users WHERE auth.users.id = profiles.id
      )
      OR
      EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = profiles.id
          AND u.is_anonymous = true
      )
    );

  INSERT INTO profiles (id, snapchat_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET snapchat_handle = p_handle;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_snapchat_handle(text) TO authenticated;

-- 5. New RPC: returns both Instagram and Snapchat handles for matched users.
--    Clients should migrate to this from get_matched_instagram_handles.
CREATE OR REPLACE FUNCTION public.get_matched_contact_handles(p_match_ids uuid[])
RETURNS TABLE(match_id uuid, instagram_handle text, snapchat_handle text)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id AS match_id, p.instagram_handle, p.snapchat_handle
  FROM matches m
  JOIN profiles p ON p.id = CASE
    WHEN m.user_a = auth.uid() THEN m.user_b
    WHEN m.user_b = auth.uid() THEN m.user_a
  END
  WHERE m.id = ANY(p_match_ids)
    AND (m.user_a = auth.uid() OR m.user_b = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_matched_contact_handles(uuid[]) TO authenticated;
