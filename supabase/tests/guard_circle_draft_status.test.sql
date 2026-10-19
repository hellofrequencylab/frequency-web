-- pgTAP behavioural guard for migration 20270346009700 (SCAN-848).
--
-- The host/guide/mentor update policy on circles checks identity alone, so before
-- SCAN-848 a host (or any guide) could PATCH status from 'draft' to 'active'
-- through PostgREST and skip publishCircleAction's create gate and hosting
-- allowance. The trigger keys on auth.role(), so these writes stay as postgres
-- (RLS does not bind) with the JWT role set to authenticated, the same way
-- prevent_founder_meta_self_edit.test.sql drives SCAN-845. A SET ROLE
-- authenticated UPDATE on an unlisted draft is filtered to zero rows by
-- circles_access_restrictive, which is not an exception and never reaches
-- the trigger (CI 39283464645).
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(11);

-- ── Seed (as postgres, which RLS does not bind) ─────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a848-000000000001', 'draft-host@test.local'),
  ('00000000-0000-4000-a848-000000000002', 'draft-guide@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b848-000000000001', '00000000-0000-4000-a848-000000000001', 'Draft Host',  'draft-host',  'host'),
  ('00000000-0000-4000-b848-000000000002', '00000000-0000-4000-a848-000000000002', 'Draft Guide', 'draft-guide', 'guide');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids so
-- get_my_profile_id()'s scalar subquery has one answer.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a848-000000000001', '00000000-0000-4000-a848-000000000002')
  and id not in ('00000000-0000-4000-b848-000000000001', '00000000-0000-4000-b848-000000000002');

insert into public.circles (id, name, slug, type, status, host_id, unlisted, access) values
  ('00000000-0000-4000-c848-000000000001', 'Draft Room', 'draft-room-848', 'online', 'draft',
   '00000000-0000-4000-b848-000000000001', true, 'open'),
  ('00000000-0000-4000-c848-000000000002', 'Live Room', 'live-room-848', 'online', 'active',
   '00000000-0000-4000-b848-000000000001', false, 'open');

-- ── 1. The trigger is attached and is not a browser-callable function ───────────────────────────

select is(
  (select count(*)::int from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'circles'
      and t.tgname = 'guard_circle_draft_status' and not t.tgisinternal),
  1,
  'guard_circle_draft_status is attached to circles');

select is(has_function_privilege('authenticated', 'public.guard_circle_draft_status()', 'execute'), false,
  'authenticated cannot execute guard_circle_draft_status');
select is(has_function_privilege('anon', 'public.guard_circle_draft_status()', 'execute'), false,
  'anon cannot execute guard_circle_draft_status');

-- ── 2. Forged publish, JWT role authenticated (the PostgREST caller) ────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a848-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.circles set status = 'active'
      where id = '00000000-0000-4000-c848-000000000001' $$,
  '42501',
  'circles: a draft leaves draft only through publish',
  'a host cannot PATCH a draft Circle to active');

select throws_ok(
  $$ update public.circles set status = 'forming'
      where id = '00000000-0000-4000-c848-000000000001' $$,
  '42501',
  'circles: a draft leaves draft only through publish',
  'a host cannot PATCH a draft Circle to forming');

select is(
  (select status from public.circles where id = '00000000-0000-4000-c848-000000000001'),
  'draft',
  'the draft is still a draft after the refused host writes');

select lives_ok(
  $$ update public.circles set name = 'Draft Room edited'
      where id = '00000000-0000-4000-c848-000000000001' $$,
  'a host can still edit a draft Circle that stays a draft');

select lives_ok(
  $$ update public.circles set status = 'inactive'
      where id = '00000000-0000-4000-c848-000000000002' $$,
  'a host can still change status on a live Circle');

-- ── 3. A guide JWT is refused the same way ──────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a848-000000000002', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.circles set status = 'active'
      where id = '00000000-0000-4000-c848-000000000001' $$,
  '42501',
  'circles: a draft leaves draft only through publish',
  'a guide cannot PATCH a draft Circle to active');

-- ── 4. The admin client's publish still writes ──────────────────────────────────────────────────

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select lives_ok(
  $$ update public.circles set status = 'active'
      where id = '00000000-0000-4000-c848-000000000001' $$,
  'service_role can publish a draft Circle');

select is(
  (select status from public.circles where id = '00000000-0000-4000-c848-000000000001'),
  'active',
  'the draft is live after the service-role publish');

select * from finish();
rollback;
