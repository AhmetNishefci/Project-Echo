-- Project Echo: Row Level Security Policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ephemeral_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Ephemeral IDs: users can only read their own active tokens
CREATE POLICY "Users can read own ephemeral IDs"
  ON public.ephemeral_ids FOR SELECT
  USING (auth.uid() = user_id);

-- Waves: NO direct client access
-- All wave operations go through Edge Functions using SECURITY DEFINER
-- RLS is enabled with no permissive policies = no client access

-- Matches: users can read matches they are part of
CREATE POLICY "Users can read own matches"
  ON public.matches FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);
