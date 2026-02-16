-- 00013: Remove pg_cron dependency
--
-- Migration 00009 added pg_cron scheduling which may not be available.
-- The cleanup_expired_data() function is fine and stays.
-- Cleanup is now triggered by a scheduled Edge Function instead of pg_cron.
--
-- This migration safely removes the cron job if pg_cron exists,
-- and is a no-op if it doesn't.

DO $$
BEGIN
  -- Remove the cron job if pg_cron is installed
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('cleanup-expired-data');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- pg_cron not available or job doesn't exist — that's fine
    NULL;
END;
$$;
