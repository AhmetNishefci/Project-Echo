-- 00015: Add index for wave rate-limit query
--
-- check_and_create_match counts recent waves per user for rate limiting:
--   SELECT COUNT(*) FROM waves WHERE waver_user_id = ? AND created_at > now() - '1 min'
--
-- Without an index on (waver_user_id, created_at), this does a sequential scan
-- on the waves table, which degrades as the table grows.

CREATE INDEX IF NOT EXISTS idx_waves_waver_created
  ON public.waves (waver_user_id, created_at DESC);
