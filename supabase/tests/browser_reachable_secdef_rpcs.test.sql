-- pgTAP regression guard for the 2026-08-11 security sweep.
--
-- TWO distinct defects, and the second is the reason this file exists rather than a code review
-- note. Both were found by asking the DATABASE what a role can do, not by reading a migration.
--
-- 1. `friendships_update_addressee_accept` carried an explicit WITH CHECK of `(status='accepted')`.
--    An UPDATE policy with no explicit WITH CHECK reuses its USING for the new row; supplying one
--    REPLACES that fallback. So user_a_id / user_b_id / requested_by were unconstrained on the new
--    row, and a member holding any pending incoming request could rewrite it into an ACCEPTED
--    friendship with any victim. Friendship is the DM gate, and lib/messages/actions.ts reads it
--    through the service-role client, so the forged row was authoritative.
--
--    RLS cannot reference OLD, so no WITH CHECK can express "the identity triple never changes".
--    The fix is a BEFORE UPDATE trigger. This file asserts the trigger EXISTS -- if someone drops
--    it and leans on the policy alone, the hole is back.
--
-- 2. The RPC lockdown below was applied ONCE and did not work. `revoke execute ... from anon,
--    authenticated` succeeded and changed nothing for four of six functions, because Postgres
--    grants EXECUTE to PUBLIC by default and both roles inherit it -- revoking a privilege a role
--    never held DIRECTLY is a no-op. The second migration revoked from PUBLIC and re-granted
--    narrowly.
--
--    That is why every assertion here is has_function_privilege() and not a grep of the migration:
--    a revoke that runs, succeeds, and protects nothing is exactly this repo's named failure mode.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
-- 12, not 14, since 20270226000000 dropped profile_zap_total and its two assertions went with it.
-- ⚠️ pgTAP's plan is a HARD count: leaving it at 14 makes the suite fail with "planned 14 but ran
-- 12" even though every remaining assertion passed, which reads as a security regression and is not.
select plan(12);

-- ── 1. The friendships identity trigger ───────────────────────────────────────
select is(
  (select count(*)::int from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'friendships'
      and t.tgname = 'friendships_freeze_identity' and not t.tgisinternal),
  1,
  'friendships_freeze_identity trigger is attached (RLS alone cannot pin the identity triple)');

select is(
  (select with_check is not null from pg_policies
    where schemaname='public' and tablename='friendships'
      and policyname='friendships_update_addressee_accept'),
  true,
  'the accept policy still declares a WITH CHECK');

-- ── 2. Admin-only SECURITY DEFINER RPCs: no browser role may execute ──────────
-- Every one of these is called exclusively through createAdminClient() (service role), which
-- does not consult these grants. A grant to anon/authenticated is pure attack surface.

select is(has_function_privilege('anon', 'public.members_near(numeric, numeric, integer, integer)', 'execute'), false,
  'anon cannot execute members_near (directory enumeration: unbounded _radius_m, no auth check)');
select is(has_function_privilege('authenticated', 'public.members_near(numeric, numeric, integer, integer)', 'execute'), false,
  'authenticated cannot execute members_near');

select is(has_function_privilege('anon', 'public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text)', 'execute'), false,
  'anon cannot execute record_qr_scan (unauthenticated write, caller-supplied p_profile, no rate limit)');
select is(has_function_privilege('authenticated', 'public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text, text)', 'execute'), false,
  'authenticated cannot execute record_qr_scan');

-- profile_zap_total's two assertions were REMOVED with the function itself
-- (20270226000000_drop_profile_zap_total.sql, ADR-1006). They had to go in the SAME change:
-- has_function_privilege() RAISES on a function that does not exist, so the moment the drop
-- migration replayed on a fresh database this file failed at exactly this line. It did, on
-- PR #2108's db-tests run, which is how the coupling was found. Nothing is un-asserted by their
-- removal — a dropped function is not reachable from a browser by any grant.

select is(has_function_privilege('anon', 'public.match_library_assets(vector, uuid, integer, text)', 'execute'), false,
  'anon cannot execute match_library_assets (content oracle over private space libraries)');
select is(has_function_privilege('authenticated', 'public.match_library_assets(vector, uuid, integer, text)', 'execute'), false,
  'authenticated cannot execute match_library_assets');

select is(has_function_privilege('anon', 'public.similar_library_assets(uuid, integer)', 'execute'), false,
  'anon cannot execute similar_library_assets');
select is(has_function_privilege('authenticated', 'public.similar_library_assets(uuid, integer)', 'execute'), false,
  'authenticated cannot execute similar_library_assets');

-- ── 3. search_handles_public is the deliberate exception ──────────────────────
-- app/api/search-handles/route.ts calls it with the USER client, so `authenticated` keeps it.
-- The member directory is not public, so anon does not.
select is(has_function_privilege('anon', 'public.search_handles_public(text)', 'execute'), false,
  'anon cannot execute search_handles_public (the member directory is not public)');
select is(has_function_privilege('authenticated', 'public.search_handles_public(text)', 'execute'), true,
  'authenticated CAN still execute search_handles_public (called with the user client)');

select * from finish();
rollback;
