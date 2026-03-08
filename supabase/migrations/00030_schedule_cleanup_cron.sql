-- 00030: Schedule hourly cleanup cron job
--
-- Calls the cleanup edge function every hour to remove:
-- - Expired ephemeral IDs (>1 hour past expiry)
-- - Consumed waves (>24 hours old)
-- - Expired unconsumed waves (>1 hour past expiry)
--
-- Uses pg_cron + pg_net to invoke the edge function with the service role key.

-- Enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the cleanup function to run at the top of every hour
SELECT cron.schedule(
  'cleanup-expired-data',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kfknepqtcnlnvufxjqvw.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
