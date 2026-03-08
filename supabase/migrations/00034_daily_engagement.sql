-- 00034: Daily engagement push notifications
--
-- Adds infrastructure for timezone-aware daily engagement notifications:
-- - timezone column on profiles (populated from device)
-- - daily_pushes_enabled preference on profiles
-- - engagement_notifications table for cooldown tracking
-- - last_active_at timestamp for activity-based targeting
-- - Updated cleanup function to prune old engagement records

-- Add timezone and daily push preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS daily_pushes_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Track engagement notification sends for cooldown
CREATE TABLE IF NOT EXISTS public.engagement_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign TEXT NOT NULL  -- e.g. 'evening', 'proximity', 'incoming_wave'
);

CREATE INDEX IF NOT EXISTS idx_engagement_notifications_user_sent
  ON public.engagement_notifications (user_id, sent_at DESC);

-- RLS: service role only (edge function uses admin client)
ALTER TABLE public.engagement_notifications ENABLE ROW LEVEL SECURITY;

-- Update cleanup function to also prune old engagement notifications
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Delete expired ephemeral IDs (1 hour past expiry)
  DELETE FROM public.ephemeral_ids
  WHERE expires_at < now() - interval '1 hour';

  -- Delete consumed waves older than 24 hours
  DELETE FROM public.waves
  WHERE is_consumed = true
    AND created_at < now() - interval '24 hours';

  -- Delete expired unconsumed waves (1 hour past expiry)
  DELETE FROM public.waves
  WHERE is_consumed = false
    AND expires_at < now() - interval '1 hour';

  -- Delete old proximity notifications (24 hours)
  DELETE FROM public.proximity_notifications
  WHERE created_at < now() - interval '24 hours';

  -- Clear stale location data (24 hours without update)
  UPDATE public.profiles
  SET last_latitude = NULL,
      last_longitude = NULL,
      last_location_at = NULL
  WHERE last_location_at IS NOT NULL
    AND last_location_at < now() - interval '24 hours';

  -- Delete old engagement notifications (14 days)
  DELETE FROM public.engagement_notifications
  WHERE sent_at < now() - interval '14 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
