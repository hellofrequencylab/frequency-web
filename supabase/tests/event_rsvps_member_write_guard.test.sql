-- pgTAP behavioural guard for migration 20270345011700 (SCAN-696).
--
-- The update-own policy on event_rsvps checks ownership alone, so before this migration a member
-- could PATCH their own row from the browser with approval_status = 'approved', attended_at = now(),
-- attended_by = themselves and plus_ones = 500. Every forged write below is made AS a member through
-- the policy, exactly the way PostgREST would make it, and must be refused; the writes the app makes
-- for a member (a pending request, a withdrawal, a re-join, a plus-one within the cap) must still
-- land; and the host's writes on the service role and the anon guest door must be untouched.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(20);

-- ── Seed (as postgres, which RLS does not bind) ─────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a696-000000000001', 'mwg-member@test.local'),
  ('00000000-0000-4000-a696-000000000002', 'mwg-host@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b696-000000000001', '00000000-0000-4000-a696-000000000001', 'MWG Member', 'mwg-member'),
  ('00000000-0000-4000-b696-000000000002', '00000000-0000-4000-a696-000000000002', 'MWG Host',   'mwg-host');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids so
-- get_my_profile_id()'s scalar subquery has one answer.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a696-000000000001', '00000000-0000-4000-a696-000000000002')
  and id not in ('00000000-0000-4000-b696-000000000001', '00000000-0000-4000-b696-000000000002');

-- A published, public, future, approval-required RSVP event with no capacity cap.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at,
                           join_mode, is_cancelled, capacity, time_zone, host_id, rsvp_requires_approval)
values
  ('00000000-0000-4000-e696-000000000001', 'MWG sit', 'mwg-sit', 'public',
   '00000000-0000-4000-e696-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, null,
   'America/Los_Angeles', '00000000-0000-4000-b696-000000000002', true);

-- ── 1. The trigger is attached, fires first, and is not a browser-callable function ─────────────

select is(
  (select count(*)::int from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'event_rsvps'
      and t.tgname = 'trg_a_event_rsvps_member_write_guard' and not t.tgisinternal),
  1,
  'trg_a_event_rsvps_member_write_guard is attached to event_rsvps');

select ok(
  'trg_a_event_rsvps_member_write_guard' < 'trg_enforce_event_rsvp_capacity'
  and 'trg_a_event_rsvps_member_write_guard' < 'trg_event_rsvps_block_suspended',
  'the guard sorts before the capacity and suspension triggers, so it fires first');

select is(has_function_privilege('authenticated', 'public.guard_event_rsvp_member_write()', 'execute'), false,
  'authenticated cannot execute guard_event_rsvp_member_write');
select is(has_function_privilege('anon', 'public.guard_event_rsvp_member_write()', 'execute'), false,
  'anon cannot execute guard_event_rsvp_member_write');

-- ── 2. Forged inserts, as the member ────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a696-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.event_rsvps (event_id, profile_id, status, approval_status)
     values ('00000000-0000-4000-e696-000000000001', '00000000-0000-4000-b696-000000000001', 'going', 'approved') $$,
  '42501', null,
  'a member cannot insert their seat already approved');

select throws_ok(
  $$ insert into public.event_rsvps (event_id, profile_id, status, approval_status, attended_at, attended_by)
     values ('00000000-0000-4000-e696-000000000001', '00000000-0000-4000-b696-000000000001', 'going', 'pending',
             now(), '00000000-0000-4000-b696-000000000001') $$,
  '42501', null,
  'a member cannot insert their seat already attended');

-- The write the app makes for a request on an approval-required event.
select lives_ok(
  $$ insert into public.event_rsvps (event_id, profile_id, status, approval_status)
     values ('00000000-0000-4000-e696-000000000001', '00000000-0000-4000-b696-000000000001', 'going', 'pending') $$,
  'a member inserts a pending request');

-- ── 3. Forged updates, as the member ────────────────────────────────────────────────────────────

select throws_ok(
  $$ update public.event_rsvps set approval_status = 'approved'
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '42501', null,
  'a member cannot approve their own request');

select throws_ok(
  $$ update public.event_rsvps set attended_at = now(), attended_by = '00000000-0000-4000-b696-000000000001'
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '42501', null,
  'a member cannot mark themselves attended');

select throws_ok(
  $$ update public.event_rsvps set plus_ones = 500
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '23514', null,
  'a member cannot claim 500 plus-ones (event_rsvps_plus_ones_check caps at 5)');

select throws_ok(
  $$ update public.event_rsvps set from_ticket_id = '00000000-0000-4000-e696-0000000000f1'
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '42501', null,
  'a member cannot stamp a ticket onto their own seat');

select throws_ok(
  $$ update public.event_rsvps set guest_claimed_by = '00000000-0000-4000-b696-000000000001', guest_claimed_at = now()
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '42501', null,
  'a member cannot write the guest claim columns on their own seat');

-- ── 4. The writes the app makes for a member still land ─────────────────────────────────────────

select lives_ok(
  $$ update public.event_rsvps set status = 'not_going', plus_ones = 0
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  'a member withdraws');

select lives_ok(
  $$ update public.event_rsvps set status = 'going', approval_status = 'pending', plus_ones = 3
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  'a member re-joins as a pending request with three plus-ones');

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select approval_status || '/' || coalesce(attended_at::text, 'null')
     from public.event_rsvps
    where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001'),
  'pending/null',
  'after every forged write the row is still a pending, unattended request');

-- ── 5. The host's writes on the service role are untouched ──────────────────────────────────────
-- This is the role the admin client's requests arrive as (PostgREST sets it from the service key).

set local role service_role;

select lives_ok(
  $$ update public.event_rsvps set approval_status = 'approved'
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  'the host approves the request on the service role');

select lives_ok(
  $$ update public.event_rsvps set attended_at = now(), attended_by = '00000000-0000-4000-b696-000000000002'
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  'the host marks the seat attended on the service role');

select throws_ok(
  $$ update public.event_rsvps set plus_ones = 6
      where event_id = '00000000-0000-4000-e696-000000000001' and profile_id = '00000000-0000-4000-b696-000000000001' $$,
  '23514', null,
  'the plus-ones ceiling binds every writer, the service role included');

reset role;

-- ── 6. The anon guest door still writes a guest seat ────────────────────────────────────────────

set local role anon;
select lives_ok(
  $$ select public.capture_guest_rsvp('00000000-0000-4000-e696-000000000001', 'mwg-guest@test.local', 'MWG Guest') $$,
  'capture_guest_rsvp (a SECURITY DEFINER door) is exempt from the guard');
reset role;

select is(
  (select approval_status from public.event_rsvps
    where event_id = '00000000-0000-4000-e696-000000000001' and guest_email = 'mwg-guest@test.local'),
  'pending',
  'the guest seat landed as a pending request through the door');

select * from finish();
rollback;
