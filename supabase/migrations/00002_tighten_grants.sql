-- 00002: Tighten database grants
--
-- Remove overly permissive GRANT ALL to anon/authenticated roles.
-- Clients (authenticated) only get the minimum permissions needed.
-- Tables accessed exclusively via SECURITY DEFINER functions get no client grants.

-- Revoke everything from anon (anon should not access this app's tables/functions)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revoke ALL from authenticated, then grant back only what's needed
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Tables clients interact with directly (protected by RLS)
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.ephemeral_ids TO authenticated;
GRANT SELECT ON TABLE public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated;

-- No grants on: waves, proximity_notifications, engagement_notifications, push_receipts
-- These are accessed only via SECURITY DEFINER functions which run as postgres.

-- Revoke all function grants from authenticated, then grant back selectively
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Functions clients may call directly
GRANT EXECUTE ON FUNCTION public.check_and_create_match(uuid, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_instagram_handle(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_matched_instagram_handles(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_match(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_peer_notes(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_note(text) TO authenticated;

-- Functions only edge functions should call: cleanup_expired_data, find_nearby_users,
-- get_engagement_eligible_users (already have service_role access)

-- Tighten default privileges for future objects
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
