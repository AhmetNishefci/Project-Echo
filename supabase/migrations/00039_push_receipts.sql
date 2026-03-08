-- 00039: Track Expo push receipt IDs for deferred delivery verification
--
-- Expo recommends checking push receipts 15+ minutes after sending.
-- This table stores receipt IDs from all push senders (engagement,
-- proximity, wave/match). The cleanup cron checks them hourly.

CREATE TABLE IF NOT EXISTS public.push_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_receipts_created
  ON public.push_receipts (created_at);

-- RLS: service role only (edge functions use admin client)
ALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;

-- Add receipt cleanup to the existing cleanup function
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

  -- Delete old push receipts (already checked or stale — 2 hours)
  DELETE FROM public.push_receipts
  WHERE created_at < now() - interval '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
