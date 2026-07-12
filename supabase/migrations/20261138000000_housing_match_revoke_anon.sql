-- Harden the housing matching RPCs: revoke EXECUTE from anon (defense in depth).
--
-- housing_match_candidates / housing_roommate_matches (20261133) are SECURITY DEFINER and
-- key entirely off auth.uid() (roommate/seeker compatibility for the CALLER). Every code path
-- calls them through an AUTHENTICATED client (lib/listings/housing.ts passes an authed client so
-- auth.uid() resolves to the member), and the results are consent-gated inside the function.
--
-- An anon caller has no auth.uid(), so today it would get nothing back — but a SECURITY DEFINER
-- function that returns member match data should not be executable by anon at all. Revoke it from
-- anon and grant explicitly to authenticated, so the surface matches the actual (member-only) use.
-- The 20261134 search_path hardening plus this REVOKE close the advisor finding. Idempotent + safe.

revoke execute on function public.housing_match_candidates(integer) from anon;
revoke execute on function public.housing_roommate_matches(integer) from anon;

grant execute on function public.housing_match_candidates(integer) to authenticated;
grant execute on function public.housing_roommate_matches(integer) to authenticated;
