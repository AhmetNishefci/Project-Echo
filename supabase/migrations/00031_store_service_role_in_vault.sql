-- 00031: Store service role key in vault for cron job authentication
-- Already applied to remote. Secret removed from file for safety.
-- To re-apply, run manually in SQL Editor:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
SELECT 1; -- no-op (already applied)
