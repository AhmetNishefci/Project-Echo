-- 00035: Schedule hourly engagement notification cron job
--
-- Runs every hour. The edge function checks each user's local time
-- (via timezone column) and only sends during the 6-9 PM local window.

SELECT cron.schedule(
  'daily-engagement-notifications',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kfknepqtcnlnvufxjqvw.supabase.co/functions/v1/daily-engagement',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
