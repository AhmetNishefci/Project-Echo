-- =============================================================================
-- Wave: Squashed initial schema
-- Generated from remote database dump + supplementary migrations
-- Replaces migrations 00001 through 00041
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_and_create_match(
  p_waver_id uuid,
  p_target_token character varying
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_target_user_id UUID;
  v_reciprocal_wave_id UUID;
  v_match_id UUID;
  v_existing_match_id UUID;
  v_recent_wave_count INT;
  v_lock_key BIGINT;
  v_matched_instagram TEXT;
BEGIN
  -- Step 1: Resolve target token to user ID
  SELECT user_id INTO v_target_user_id
  FROM public.ephemeral_ids
  WHERE token = p_target_token
    AND (is_active = true OR expires_at > now());

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_or_expired_token');
  END IF;

  -- Prevent self-wave
  IF v_target_user_id = p_waver_id THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'self_wave');
  END IF;

  -- Step 2: Advisory lock on the ordered user pair
  v_lock_key := hashtext(
    LEAST(p_waver_id::text, v_target_user_id::text) ||
    GREATEST(p_waver_id::text, v_target_user_id::text)
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Step 3: Rate limit INSIDE the lock so concurrent waves are serialized
  SELECT COUNT(*) INTO v_recent_wave_count
  FROM public.waves
  WHERE waver_user_id = p_waver_id
    AND created_at > now() - interval '1 minute';

  IF v_recent_wave_count >= 20 THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'rate_limited');
  END IF;

  -- Step 4: Early check — already matched?
  SELECT m.id INTO v_existing_match_id
  FROM public.matches m
  WHERE m.user_a = LEAST(p_waver_id, v_target_user_id)
    AND m.user_b = GREATEST(p_waver_id, v_target_user_id);

  IF v_existing_match_id IS NOT NULL THEN
    SELECT p.instagram_handle INTO v_matched_instagram
    FROM public.profiles p
    WHERE p.id = v_target_user_id;

    RETURN jsonb_build_object(
      'status', 'already_matched',
      'match_id', v_existing_match_id,
      'matched_user_id', v_target_user_id,
      'instagram_handle', COALESCE(v_matched_instagram, '')
    );
  END IF;

  -- Step 5: Insert the wave FIRST (before checking reciprocals)
  INSERT INTO public.waves (waver_user_id, target_ephemeral_token, expires_at)
  VALUES (p_waver_id, p_target_token, now() + INTERVAL '15 minutes')
  ON CONFLICT DO NOTHING;

  -- Step 6: Check if target has already waved at the waver
  SELECT w.id INTO v_reciprocal_wave_id
  FROM public.waves w
  JOIN public.ephemeral_ids e ON w.target_ephemeral_token = e.token
  WHERE w.waver_user_id = v_target_user_id
    AND e.user_id = p_waver_id
    AND (e.is_active = true OR e.expires_at > now())
    AND w.is_consumed = false
    AND w.expires_at > now()
  LIMIT 1
  FOR UPDATE OF w;

  -- Step 7: If reciprocal wave exists, create a match
  IF v_reciprocal_wave_id IS NOT NULL THEN
    UPDATE public.waves SET is_consumed = true
    WHERE id = v_reciprocal_wave_id;

    UPDATE public.waves SET is_consumed = true
    WHERE waver_user_id = p_waver_id
      AND target_ephemeral_token = p_target_token
      AND is_consumed = false;

    INSERT INTO public.matches (user_a, user_b)
    VALUES (
      LEAST(p_waver_id, v_target_user_id),
      GREATEST(p_waver_id, v_target_user_id)
    )
    ON CONFLICT (LEAST(user_a, user_b), GREATEST(user_a, user_b)) DO NOTHING
    RETURNING id INTO v_match_id;

    IF v_match_id IS NOT NULL THEN
      SELECT p.instagram_handle INTO v_matched_instagram
      FROM public.profiles p
      WHERE p.id = v_target_user_id;

      RETURN jsonb_build_object(
        'status', 'match',
        'match_id', v_match_id,
        'matched_user_id', v_target_user_id,
        'instagram_handle', COALESCE(v_matched_instagram, '')
      );
    ELSE
      RETURN jsonb_build_object('status', 'already_matched');
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'pending', 'target_user_id', v_target_user_id);
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_instagram_handle(p_handle text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET instagram_handle = NULL
  WHERE LOWER(instagram_handle) = LOWER(p_handle)
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

  INSERT INTO profiles (id, instagram_handle)
  VALUES (auth.uid(), p_handle)
  ON CONFLICT (id) DO UPDATE SET instagram_handle = p_handle;
END;
$$;


CREATE OR REPLACE FUNCTION public.cleanup_expired_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.ephemeral_ids
  WHERE expires_at < now() - interval '1 hour';

  DELETE FROM public.waves
  WHERE is_consumed = true
    AND created_at < now() - interval '24 hours';

  DELETE FROM public.waves
  WHERE is_consumed = false
    AND expires_at < now() - interval '1 hour';

  DELETE FROM public.proximity_notifications
  WHERE created_at < now() - interval '24 hours';

  UPDATE public.profiles
  SET last_latitude = NULL,
      last_longitude = NULL,
      last_location_at = NULL
  WHERE last_location_at IS NOT NULL
    AND last_location_at < now() - interval '24 hours';

  DELETE FROM public.engagement_notifications
  WHERE sent_at < now() - interval '14 days';

  DELETE FROM public.push_receipts
  WHERE created_at < now() - interval '2 hours';
END;
$$;


CREATE OR REPLACE FUNCTION public.find_nearby_users(
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer DEFAULT 300,
  p_max_results integer DEFAULT 50
) RETURNS TABLE(user_id uuid, push_token text, platform text, distance_meters double precision)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    pt.token AS push_token,
    pt.platform,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.last_longitude, p.last_latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) AS distance_meters
  FROM public.profiles p
  JOIN public.push_tokens pt ON pt.user_id = p.id
  WHERE p.id != p_user_id
    AND p.last_latitude IS NOT NULL
    AND p.last_longitude IS NOT NULL
    AND p.last_location_at > now() - interval '2 hours'
    AND p.nearby_alerts_enabled = true
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p.last_longitude, p.last_latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_meters
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.proximity_notifications pn
      WHERE pn.user_id = p.id
        AND pn.created_at > now() - interval '1 hour'
    )
  ORDER BY distance_meters ASC
  LIMIT p_max_results;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_engagement_eligible_users(
  p_target_hour_start integer,
  p_target_hour_end integer,
  p_active_within_days integer,
  p_engagement_cooldown_hours integer,
  p_max_ignored_sends integer,
  p_max_results integer DEFAULT 500
) RETURNS TABLE(user_id uuid, push_token text, is_local_weekend boolean, local_dow integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  valid_timezones AS (
    SELECT name FROM pg_timezone_names
  ),
  base_eligible AS (
    SELECT DISTINCT ON (p.id)
      p.id AS uid,
      pt.token AS ptoken,
      p.timezone AS tz,
      p.last_active_at
    FROM public.profiles p
    INNER JOIN public.push_tokens pt ON pt.user_id = p.id
    INNER JOIN valid_timezones vt ON vt.name = p.timezone
    WHERE
      p.daily_pushes_enabled = true
      AND p.timezone IS NOT NULL
      AND p.last_active_at IS NOT NULL
      AND p.last_active_at > now() - make_interval(days => p_active_within_days)
      AND EXTRACT(HOUR FROM now() AT TIME ZONE p.timezone)
          BETWEEN p_target_hour_start AND p_target_hour_end
    ORDER BY p.id, pt.updated_at DESC
  ),
  no_recent_engagement AS (
    SELECT be.uid, be.ptoken, be.tz, be.last_active_at
    FROM base_eligible be
    WHERE NOT EXISTS (
      SELECT 1 FROM public.engagement_notifications en
      WHERE en.user_id = be.uid
        AND en.sent_at > now() - make_interval(hours => p_engagement_cooldown_hours)
    )
  ),
  not_ignoring AS (
    SELECT nre.uid, nre.ptoken, nre.tz
    FROM no_recent_engagement nre
    WHERE (
      SELECT COUNT(*) FROM public.engagement_notifications en
      WHERE en.user_id = nre.uid
        AND en.sent_at > nre.last_active_at
    ) < p_max_ignored_sends
  )
  SELECT
    ni.uid AS user_id,
    ni.ptoken AS push_token,
    EXTRACT(DOW FROM now() AT TIME ZONE ni.tz) IN (0, 6) AS is_local_weekend,
    EXTRACT(DOW FROM now() AT TIME ZONE ni.tz)::INT AS local_dow
  FROM not_ignoring ni
  LIMIT p_max_results;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_matched_instagram_handles(p_match_ids uuid[])
RETURNS TABLE(match_id uuid, instagram_handle text)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id AS match_id, p.instagram_handle
  FROM matches m
  JOIN profiles p ON p.id = CASE
    WHEN m.user_a = auth.uid() THEN m.user_b
    WHEN m.user_b = auth.uid() THEN m.user_a
  END
  WHERE m.id = ANY(p_match_ids)
    AND (m.user_a = auth.uid() OR m.user_b = auth.uid());
$$;


CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, is_anonymous)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_app_meta_data->>'is_anonymous')::boolean, false)
  );
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.prevent_gender_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.gender IS NOT NULL AND (NEW.gender IS NULL OR NEW.gender IS DISTINCT FROM OLD.gender) THEN
    RAISE EXCEPTION 'Gender cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.remove_match(p_user_id uuid, p_match_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_other_user_id UUID;
BEGIN
  SELECT
    CASE
      WHEN user_a = p_user_id THEN user_b
      WHEN user_b = p_user_id THEN user_a
      ELSE NULL
    END INTO v_other_user_id
  FROM public.matches
  WHERE id = p_match_id;

  IF v_other_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'not_found');
  END IF;

  DELETE FROM public.matches WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'status', 'removed',
    'other_user_id', v_other_user_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.resolve_peer_notes(p_tokens text[])
RETURNS TABLE(token text, note text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT e.token::TEXT, e.note::TEXT
  FROM public.ephemeral_ids e
  WHERE e.token = ANY(p_tokens)
    AND e.is_active = true
    AND e.expires_at > now()
    AND e.note IS NOT NULL
    AND e.note <> '';
END;
$$;


CREATE OR REPLACE FUNCTION public.update_active_note(p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_note IS NOT NULL AND char_length(p_note) > 40 THEN
    RAISE EXCEPTION 'Note exceeds 40 character limit';
  END IF;

  UPDATE public.ephemeral_ids
  SET note = NULLIF(p_note, '')
  WHERE user_id = auth.uid()
    AND is_active = true;
END;
$$;


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  is_anonymous boolean DEFAULT true NOT NULL,
  instagram_handle text,
  instagram_user_id text,
  gender text,
  gender_preference text DEFAULT 'both'::text,
  note text,
  last_latitude double precision,
  last_longitude double precision,
  last_location_at timestamptz,
  nearby_alerts_enabled boolean DEFAULT true NOT NULL,
  nearby_alerts_onboarded boolean DEFAULT false NOT NULL,
  timezone text,
  daily_pushes_enabled boolean DEFAULT true NOT NULL,
  last_active_at timestamptz,

  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_instagram_user_id_key UNIQUE (instagram_user_id),
  CONSTRAINT profiles_gender_check CHECK (gender = ANY (ARRAY['male'::text, 'female'::text])),
  CONSTRAINT profiles_gender_preference_check CHECK (gender_preference = ANY (ARRAY['male'::text, 'female'::text, 'both'::text])),
  CONSTRAINT profiles_note_check CHECK (char_length(note) <= 40),
  CONSTRAINT valid_instagram_handle CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$'::text)
);


CREATE TABLE IF NOT EXISTS public.ephemeral_ids (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token character varying(16) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  note text,

  CONSTRAINT ephemeral_ids_pkey PRIMARY KEY (id),
  CONSTRAINT unique_active_token UNIQUE (token),
  CONSTRAINT ephemeral_ids_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT ephemeral_ids_note_length CHECK (char_length(note) <= 40)
);


CREATE TABLE IF NOT EXISTS public.waves (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  waver_user_id uuid NOT NULL,
  target_ephemeral_token character varying(16) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  is_consumed boolean DEFAULT false NOT NULL,

  CONSTRAINT waves_pkey PRIMARY KEY (id),
  CONSTRAINT waves_waver_user_id_fkey FOREIGN KEY (waver_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS public.matches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_user_a_fkey FOREIGN KEY (user_a) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT matches_user_b_fkey FOREIGN KEY (user_b) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT no_self_match CHECK (user_a <> user_b)
);


CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT unique_user_platform UNIQUE (user_id, platform),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT push_tokens_platform_check CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text]))
);


CREATE TABLE IF NOT EXISTS public.proximity_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  triggered_by uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT proximity_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT proximity_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT proximity_notifications_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS public.engagement_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  sent_at timestamptz DEFAULT now() NOT NULL,
  campaign text NOT NULL,

  CONSTRAINT engagement_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT engagement_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS public.push_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receipt_id text NOT NULL,
  push_token text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT push_receipts_pkey PRIMARY KEY (id)
);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_ephemeral_ids_token_active ON public.ephemeral_ids USING btree (token) WHERE (is_active = true);
CREATE INDEX idx_ephemeral_ids_user_active ON public.ephemeral_ids USING btree (user_id, is_active) WHERE (is_active = true);
CREATE UNIQUE INDEX idx_ephemeral_one_active_per_user ON public.ephemeral_ids USING btree (user_id) WHERE (is_active = true);

CREATE UNIQUE INDEX idx_unique_wave_per_token ON public.waves USING btree (waver_user_id, target_ephemeral_token) WHERE (is_consumed = false);
CREATE INDEX idx_waves_target_token ON public.waves USING btree (target_ephemeral_token, is_consumed) WHERE (is_consumed = false);
CREATE INDEX idx_waves_waver_created ON public.waves USING btree (waver_user_id, created_at DESC);

CREATE UNIQUE INDEX idx_unique_match ON public.matches USING btree (LEAST(user_a, user_b), GREATEST(user_a, user_b));

CREATE UNIQUE INDEX idx_profiles_instagram_handle ON public.profiles USING btree (lower(instagram_handle)) WHERE (instagram_handle IS NOT NULL);
CREATE INDEX idx_profiles_ig_user_id ON public.profiles USING btree (instagram_user_id);
CREATE INDEX idx_profiles_last_active_at ON public.profiles USING btree (last_active_at DESC) WHERE (last_active_at IS NOT NULL);
CREATE INDEX idx_profiles_location ON public.profiles USING gist (
  (ST_SetSRID(ST_MakePoint(
    COALESCE(last_longitude, 0::double precision),
    COALESCE(last_latitude, 0::double precision)
  ), 4326)::geography)
) WHERE (last_latitude IS NOT NULL AND last_longitude IS NOT NULL);

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);

CREATE INDEX idx_proximity_notif_user_created ON public.proximity_notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_engagement_notifications_user_sent ON public.engagement_notifications USING btree (user_id, sent_at DESC);

CREATE INDEX idx_push_receipts_created ON public.push_receipts USING btree (created_at);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER enforce_gender_immutability
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_gender_change();

-- Auto-create profile when a new auth user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ephemeral_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proximity_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Ephemeral IDs
CREATE POLICY "Users can read own ephemeral IDs"
  ON public.ephemeral_ids FOR SELECT USING (auth.uid() = user_id);

-- Matches
CREATE POLICY "Users can read own matches"
  ON public.matches FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Push tokens
CREATE POLICY "Users can manage own push tokens"
  ON public.push_tokens USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Waves, proximity_notifications, engagement_notifications, push_receipts:
-- No direct client policies. All access via SECURITY DEFINER functions.


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ephemeral_ids TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.waves TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.matches TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.push_tokens TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.proximity_notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.engagement_notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.push_receipts TO anon, authenticated, service_role;

GRANT ALL ON FUNCTION public.check_and_create_match(uuid, character varying) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.claim_instagram_handle(text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.cleanup_expired_data() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.find_nearby_users(uuid, double precision, double precision, integer, integer) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_engagement_eligible_users(integer, integer, integer, integer, integer, integer) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_matched_instagram_handles(uuid[]) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.prevent_gender_change() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.remove_match(uuid, uuid) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.resolve_peer_notes(text[]) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_active_note(text) TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Cron jobs (pg_cron + pg_net → edge functions)
-- Reads URLs & keys from Supabase Vault for portability.
-- NOTE: Vault secrets (service_role_key, project_url) must be created
-- manually via SQL Editor before cron jobs will succeed:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--   SELECT vault.create_secret('<PROJECT_URL>', 'project_url');
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'cleanup-expired-data',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'daily-engagement-notifications',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/daily-engagement',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
