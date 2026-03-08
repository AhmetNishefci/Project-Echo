-- 00033: Update cleanup function to handle location and proximity data
--
-- Adds to the hourly cleanup:
-- - Delete proximity_notifications older than 24 hours
-- - Clear stale location data older than 24 hours

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
