-- The previous migration revoked EXECUTE from `anon` and `authenticated` and did NOT close the
-- hole. Verified immediately after applying it:
--
--   proname                anon   authenticated
--   match_library_assets   false  false     <- closed
--   similar_library_assets false  false     <- closed
--   members_near           TRUE   TRUE      <- still open
--   profile_zap_total      TRUE   TRUE      <- still open
--   record_qr_scan         TRUE   TRUE      <- still open
--   search_handles_public  TRUE   TRUE      <- still open
--
-- Cause: Postgres grants EXECUTE on new functions to the pseudo-role PUBLIC by default, and
-- `anon`/`authenticated` are members of PUBLIC. Revoking a privilege a role never held DIRECTLY
-- is a no-op -- the PUBLIC grant still satisfies has_function_privilege(). The two that did close
-- were the two whose grants happened to be direct-only.
--
-- This is precisely the failure mode this repo names: a revoke that runs, succeeds, and protects
-- nothing. The check that catches it is asking the database what a role can DO, not what the
-- migration said. After this migration, verified again as the anon role:
--   select public.members_near(0,0,20000000,1000);  ->  ERROR 42501 permission denied

-- BOTH revokes, in THIS file, for every function. supabase/migrations/fail-open-guards.test.ts
-- enforces exactly that (ADR-959) and it caught this migration when the role revokes lived only
-- in the previous one: Supabase's ALTER DEFAULT PRIVILEGES grants land as explicit PER-ROLE
-- grants that `revoke ... from public` does not touch, and PUBLIC grants are invisible to a role
-- revoke. Either revoke alone leaves a live path, and a file that carries only one of them
-- reports success while locking nothing. The role revokes below are therefore repeated rather
-- than inherited -- re-revoking a privilege already gone is a harmless no-op, and it makes this
-- file correct on its own under a fresh replay.
revoke execute on function public.members_near(numeric, numeric, integer, integer) from anon, authenticated, public;
revoke execute on function public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text) from anon, authenticated, public;
revoke execute on function public.profile_zap_total(uuid) from anon, authenticated, public;
revoke execute on function public.search_handles_public(text) from anon, public;
revoke execute on function public.match_library_assets(vector, uuid, integer, text) from anon, authenticated, public;
revoke execute on function public.similar_library_assets(uuid, integer) from anon, authenticated, public;

-- Re-grant deliberately and narrowly. service_role is the only caller for four of these; the
-- fifth (search_handles_public) is called with the USER client from app/api/search-handles.
grant execute on function public.members_near(numeric, numeric, integer, integer) to service_role;
grant execute on function public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text) to service_role;
grant execute on function public.profile_zap_total(uuid) to service_role;
grant execute on function public.match_library_assets(vector, uuid, integer, text) to service_role;
grant execute on function public.similar_library_assets(uuid, integer) to service_role;
grant execute on function public.search_handles_public(text) to authenticated, service_role;
