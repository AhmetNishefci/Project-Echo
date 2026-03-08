-- 00040: Re-schedule cron jobs to read Supabase URL from vault
--
-- Previously, migrations 00030 and 00035 hardcoded the project URL.
-- This re-schedules both jobs to read the URL from vault, making
-- the setup portable across environments.

-- Store the project URL in vault (idempotent — ignored if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url'
  ) THEN
    PERFORM vault.create_secret(
      'https://kfknepqtcnlnvufxjqvw.supabase.co',
      'project_url'
    );
  END IF;
END $$;

-- Re-schedule cleanup cron to use vault URL
SELECT cron.unschedule('cleanup-expired-data');
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

-- Re-schedule engagement cron to use vault URL
SELECT cron.unschedule('daily-engagement-notifications');
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
