-- 00032: Add location fields and proximity notification tracking
--
-- Enables geofence-based proximity alerts:
-- - Store user's last known location (When In Use)
-- - Track proximity notifications for cooldown (1/hour)
-- - PostGIS for efficient geospatial queries

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add location fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nearby_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nearby_alerts_onboarded BOOLEAN NOT NULL DEFAULT false;

-- Track proximity notifications for per-user cooldown
CREATE TABLE IF NOT EXISTS public.proximity_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proximity_notif_user_created
  ON public.proximity_notifications (user_id, created_at DESC);

-- Spatial index for fast proximity queries
-- Uses a functional index on geography points
CREATE INDEX IF NOT EXISTS idx_profiles_location
  ON public.profiles USING GIST (
    CAST(ST_SetSRID(ST_MakePoint(
      COALESCE(last_longitude, 0),
      COALESCE(last_latitude, 0)
    ), 4326) AS geography)
  )
  WHERE last_latitude IS NOT NULL AND last_longitude IS NOT NULL;

-- RLS: Users can read/update their own location
-- (profiles already has RLS enabled with own-row policy)
-- Add update policy for location fields
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- RLS for proximity_notifications: no direct client access
-- All operations go through edge functions with service role
ALTER TABLE public.proximity_notifications ENABLE ROW LEVEL SECURITY;

-- SQL function to find nearby users for the edge function
CREATE OR REPLACE FUNCTION public.find_nearby_users(
  p_user_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_meters INT DEFAULT 300,
  p_max_results INT DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  push_token TEXT,
  platform TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
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
    -- Location updated within last 2 hours
    AND p.last_location_at > now() - interval '2 hours'
    -- User has alerts enabled
    AND p.nearby_alerts_enabled = true
    -- Within radius
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p.last_longitude, p.last_latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_meters
    )
    -- Not notified in the last hour (cooldown)
    AND NOT EXISTS (
      SELECT 1 FROM public.proximity_notifications pn
      WHERE pn.user_id = p.id
        AND pn.created_at > now() - interval '1 hour'
    )
  ORDER BY distance_meters ASC
  LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
