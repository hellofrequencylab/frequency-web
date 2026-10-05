-- SCAN-696 behavioural guard for trg_a_event_rsvps_member_write_guard (migration 20270346000696).
--
-- The update-own policy on event_rsvps checks ownership alone, so before this trigger a member
-- could approve their own pending request, mark themselves attended and set any plus_ones on
-- their own row. This file runs each forged write AS THE MEMBER (set local role authenticated,
-- the JWT sub pointing at their auth user, RLS on) and expects 42501; then it runs the host's
-- writes as postgres (the admin client and every SECURITY DEFINER door run as a trusted role)
-- and expects them to land, so the fix cannot have closed the real paths.
--
-- Fixture style follows space_update_rls_narrowing.test.sql: seeded as postgres, the
-- auto-provisioned profiles removed, fresh-stack grants restated (the POLICIES and the TRIGGER
-- are what this file tests, not the grant baseline). One transaction, rolled back.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a696-000000000001', 's696-member@test.local'),
  ('00000000-0000-4000-a696-000000000002', 's696-host@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b696-000000000001', '00000000-0000-4000-a696-000000000001', 'S696 Member', 's696-member', 'member'),
  ('00000000-0000-4000-b696-000000000002', '00000000-0000-4000-a696-000000000002', 'S696 Host',   's696-host',   'host');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a696-000000000001', '00000000-0000-4000-a696-000000000002')
  and id not in ('00000000-0000-4000-b696-000000000001', '00000000-0000-4000-b696-000000000002');

-- A published event with no capacity (the capacity trigger takes its lock and returns). The scope
-- is a bare uuid: events.scope_id carries no FK, and nothing here reads the Circle.
insert into public.events (id, title, slug, host_id, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-d696-000000000001', 'S696 gathering', 's696-gathering',
   '00000000-0000-4000-b696-000000000002', 'circle', '00000000-0000-4000-e696-000000000001',
   'public', 'published', now() + interval '7 days', now() + interval '7 days 2 hours', 'rsvp', false);

-- The member's own pending request, seeded as postgres so the forged UPDATEs have a row to hit.
insert into public.event_rsvps (id, event_id, profile_id, status, approval_status, plus_ones)
values
  ('00000000-0000-4000-f696-000000000001', '00000000-0000-4000-d696-000000000001',
   '00000000-0000-4000-b696-000000000001', 'going', 'pending', 0);

-- Fresh-stack grants (see header).
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant select on public.events, public.profiles to authenticated;

-- ── The catalog: the trigger is attached and fires before the capacity trigger ───────────────────

select is(
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'event_rsvps' and t.tgname = 'trg_a_event_rsvps_member_write_guard' and not t.tgisinternal),
  1::bigint,
  'trg_a_event_rsvps_member_write_guard is attached to event_rsvps');

select ok(
  'trg_a_event_rsvps_member_write_guard' < 'trg_enforce_event_rsvp_capacity',
  'the guard sorts before the capacity trigger, so it fires first');

-- ── As the member: every forged write is refused ────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a696-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.event_rsvps set approval_status = 'approved'
     where id = '00000000-0000-4000-f696-000000000001' $$,
  '42501', null,
  'a member cannot approve their own pending request');

select throws_ok(
  $$ update public.event_rsvps set attended_at = now(), attended_by = '00000000-0000-4000-b696-000000000001'
     where id = '00000000-0000-4000-f696-000000000001' $$,
  '42501', null,
  'a member cannot mark themselves attended');

select throws_ok(
  $$ update public.event_rsvps set plus_ones = 500
     where id = '00000000-0000-4000-f696-000000000001' $$,
  '42501', null,
  'a member cannot claim 500 plus-ones');

select throws_ok(
  $$ update public.event_rsvps set guest_email = 'forged@test.local'
     where id = '00000000-0000-4000-f696-000000000001' $$,
  '42501', null,
  'a member cannot write a guest column on their own row');

select throws_ok(
  $$ update public.event_rsvps set approval_status = 'none'
     where id = '00000000-0000-4000-f696-000000000001' $$,
  '42501', null,
  'a member cannot move a pending request back to none');

select lives_ok(
  $$ update public.event_rsvps set plus_ones = 2, status = 'going'
     where id = '00000000-0000-4000-f696-000000000001' $$,
  'a member may still set plus_ones within the app max and their own status');

-- A fresh row cannot arrive approved or attended either (delete the seeded one first so the
-- unique (event_id, profile_id) pair is free; delete-own is the member's own policy).
select lives_ok(
  $$ delete from public.event_rsvps where id = '00000000-0000-4000-f696-000000000001' $$,
  'control: the member deletes their own row');

select throws_ok(
  $$ insert into public.event_rsvps (event_id, profile_id, status, approval_status)
     values ('00000000-0000-4000-d696-000000000001', '00000000-0000-4000-b696-000000000001', 'going', 'approved') $$,
  '42501', null,
  'a member cannot insert an approved seat');

select throws_ok(
  $$ insert into public.event_rsvps (event_id, profile_id, status, approval_status, attended_at, attended_by)
     values ('00000000-0000-4000-d696-000000000001', '00000000-0000-4000-b696-000000000001', 'going', 'pending',
             now(), '00000000-0000-4000-b696-000000000001') $$,
  '42501', null,
  'a member cannot insert an attended seat');

select lives_ok(
  $$ insert into public.event_rsvps (id, event_id, profile_id, status, approval_status)
     values ('00000000-0000-4000-f696-000000000002', '00000000-0000-4000-d696-000000000001',
             '00000000-0000-4000-b696-000000000001', 'going', 'pending') $$,
  'a member still files a pending request');

reset role;
select set_config('request.jwt.claims', '', true);

-- ── As postgres (the admin client and the SECURITY DEFINER doors): the host paths still land ────

select lives_ok(
  $$ update public.event_rsvps set approval_status = 'approved'
     where id = '00000000-0000-4000-f696-000000000002' $$,
  'the host approves a request through the trusted role');

select lives_ok(
  $$ update public.event_rsvps set attended_at = now(), attended_by = '00000000-0000-4000-b696-000000000002'
     where id = '00000000-0000-4000-f696-000000000002' $$,
  'the host marks attendance through the trusted role');

select * from finish();
rollback;
