-- 00037: Prevent concurrent ephemeral token creation for the same user
--
-- The assign-ephemeral-id edge function deactivates old tokens then inserts
-- a new one. Without a unique constraint, two concurrent requests can both
-- insert an active token. This partial unique index ensures only one active
-- token per user at the database level.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ephemeral_one_active_per_user
  ON public.ephemeral_ids (user_id)
  WHERE is_active = true;
