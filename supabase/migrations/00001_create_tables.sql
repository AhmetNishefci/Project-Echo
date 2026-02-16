-- Project Echo: Database Schema
-- Tables for user profiles, ephemeral IDs, waves, and matches

-- Minimal user profile, created automatically on signup via trigger
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_anonymous BOOLEAN NOT NULL DEFAULT true
);

-- Server-assigned rotating ephemeral BLE tokens
CREATE TABLE public.ephemeral_ids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       VARCHAR(16) NOT NULL, -- 8 bytes hex-encoded
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT unique_active_token UNIQUE (token)
);

-- Index for fast token lookup (hot path in send-wave)
CREATE INDEX idx_ephemeral_ids_token_active
  ON public.ephemeral_ids (token)
  WHERE is_active = true;

-- Index for finding user's current active token
CREATE INDEX idx_ephemeral_ids_user_active
  ON public.ephemeral_ids (user_id, is_active)
  WHERE is_active = true;

-- Wave records: "I waved at the person broadcasting this token"
CREATE TABLE public.waves (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waver_user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_ephemeral_token  VARCHAR(16) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL,
  is_consumed             BOOLEAN NOT NULL DEFAULT false
);

-- Index for checking reciprocal waves
CREATE INDEX idx_waves_target_token
  ON public.waves (target_ephemeral_token, is_consumed)
  WHERE is_consumed = false;

-- Successful mutual matches
CREATE TABLE public.matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_match CHECK (user_a <> user_b)
);

-- Unique index on ordered pair to prevent duplicate matches
CREATE UNIQUE INDEX idx_unique_match
  ON public.matches (LEAST(user_a, user_b), GREATEST(user_a, user_b));

-- Trigger: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, is_anonymous)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_app_meta_data->>'is_anonymous')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
