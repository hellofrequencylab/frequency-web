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

revoke execute on function public.members_near(numeric, numeric, integer, integer) from public;
revoke execute on function public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text) from public;
revoke execute on function public.profile_zap_total(uuid) from public;
revoke execute on function public.search_handles_public(text) from public;
revoke execute on function public.match_library_assets(vector, uuid, integer, text) from public;
revoke execute on function public.similar_library_assets(uuid, integer) from public;

-- Re-grant deliberately and narrowly. service_role is the only caller for four of these; the
-- fifth (search_handles_public) is called with the USER client from app/api/search-handles.
grant execute on function public.members_near(numeric, numeric, integer, integer) to service_role;
grant execute on function public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text) to service_role;
grant execute on function public.profile_zap_total(uuid) to service_role;
grant execute on function public.match_library_assets(vector, uuid, integer, text) to service_role;
grant execute on function public.similar_library_assets(uuid, integer) to service_role;
grant execute on function public.search_handles_public(text) to authenticated, service_role;
