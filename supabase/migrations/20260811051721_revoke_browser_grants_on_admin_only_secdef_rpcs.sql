-- PostgREST exposes every public function as an RPC, so an EXECUTE grant to `anon` or
-- `authenticated` is a browser-reachable endpoint reachable with the public key. These are
-- SECURITY DEFINER (so they bypass RLS by construction) and every in-app caller uses the
-- SERVICE-ROLE admin client, which does not consult these grants at all. The grants were
-- therefore pure attack surface: nothing in the app loses a capability here.
--
-- Verified caller-by-caller before revoking:
--   members_near            lib/connections/connection-settings.ts:120   createAdminClient()
--   record_qr_scan          app/q/[slug]/route.ts:41,111                 createAdminClient()
--   profile_zap_total       lib/profile-zaps.ts:18                       createAdminClient()
--   match_library_assets    lib/library/embeddings.ts:91   (db() ->      createAdminClient())
--   similar_library_assets  lib/library/embeddings.ts:113  (db() ->      createAdminClient())
--
-- What each one handed out:
--   members_near      anon could enumerate the member directory. Its `me` CTE is used ONLY to
--                     exclude the caller from results -- there is no auth check -- and _radius_m
--                     is caller-controlled and unbounded, so one call with a 20,000 km radius
--                     returns every directory-visible member. Confirmed by running it as anon:
--                     members_near(0,0,20000000,1000) -> 7 rows, while `select from profiles` as
--                     anon -> 0 rows. The RLS on profiles is correct; this was the bypass, and
--                     it is the shape this repo calls "a gate at the wrong layer".
--   record_qr_scan    an unauthenticated WRITE with no rate limit and a caller-supplied p_profile:
--                     anyone could forge unlimited scan rows attributed to any member at any
--                     lat/lng and inflate any code's scan_count. That data feeds the CRM person
--                     trail, the A/B variant rollup and operator analytics.
--   profile_zap_total any profile's lifetime zap total, to anon.
--   match_/similar_library_assets   an id+similarity oracle over any space's library, including
--                     visibility='private' assets. The row bodies still hit library_assets RLS
--                     (deny-all), so this leaked existence and similarity rather than content.
--
-- NOT changed here, deliberately: no function BODY is rewritten. Adding an internal
-- `auth.uid() is null` guard would be good defence in depth, but it means reproducing bodies
-- that are not read in this migration, and a first attempt at exactly that failed on
-- circle_momentum's return type -- proof that the shapes are not what they look like from the
-- call sites. The grant is the wall; tightening the bodies is a separate, sighted change.
--
-- 🔴 THIS MIGRATION IS NOT SUFFICIENT ON ITS OWN. See the next one: revoking from `anon` and
-- `authenticated` left four of the six still reachable, because the grant came from PUBLIC.

revoke execute on function public.members_near(numeric, numeric, integer, integer) from anon, authenticated;
revoke execute on function public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text) from anon, authenticated;
revoke execute on function public.profile_zap_total(uuid) from anon, authenticated;
revoke execute on function public.match_library_assets(vector, uuid, integer, text) from authenticated;
revoke execute on function public.similar_library_assets(uuid, integer) from authenticated;

-- search_handles_public is the exception: app/api/search-handles/route.ts calls it with the USER
-- client, so `authenticated` keeps it. Only anon loses the grant -- the member directory is not
-- public. Confirmed as anon before the change: search_handles_public('a') -> 4 rows.
revoke execute on function public.search_handles_public(text) from anon;
