-- 00006: Revoke direct RPC access to functions that accept user IDs as parameters
--
-- check_and_create_match and remove_match accept user IDs and run as
-- SECURITY DEFINER (bypassing RLS). Granting EXECUTE to authenticated
-- allows any signed-in user to call them with arbitrary user IDs,
-- enabling wave spoofing and match deletion.
--
-- These functions are only called by Edge Functions via service_role,
-- which retains full access. No client code calls them directly.

REVOKE EXECUTE ON FUNCTION public.check_and_create_match(uuid, character varying) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_match(uuid, uuid) FROM authenticated;
