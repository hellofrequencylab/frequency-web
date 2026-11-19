-- pgTAP behavioural guard for SEC-027: a member cannot take a free seat on a ticketed event.
--
-- Before SEC-027 a member could insert or update their own event_rsvps row to 'going' on an event
-- that sells tickets, through setRsvpStatus or PostgREST, and isAdmitted() counted it as a seat.
-- The forged writes below are made AS the member through the policy and must be refused; a free
-- event, a 'not_going' answer, the host's own seat and a server write must still land.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest. The rule lives in its own
-- trigger, trg_b_event_rsvps_ticket_seat, beside the member write guard.

begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a027-000000000001', 'sec027-member@test.local'),
  ('00000000-0000-4000-a027-000000000002', 'sec027-host@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b027-000000000001', '00000000-0000-4000-a027-000000000001', 'SEC027 Member', 'sec027-member'),
  ('00000000-0000-4000-b027-000000000002', '00000000-0000-4000-a027-000000000002', 'SEC027 Host',   'sec027-host');

delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a027-000000000001', '00000000-0000-4000-a027-000000000002')
  and id not in ('00000000-0000-4000-b027-000000000001', '00000000-0000-4000-b027-000000000002');

-- A ticketed event (flat price, join_mode auto) and a free twin.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at,
                           join_mode, is_cancelled, capacity, time_zone, host_id, rsvp_requires_approval, price_cents)
values
  ('00000000-0000-4000-e027-000000000001', 'SEC027 paid', 'sec027-paid', 'public',
   '00000000-0000-4000-e027-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'auto', false, null,
   'America/Los_Angeles', '00000000-0000-4000-b027-000000000002', false, 5500),
  ('00000000-0000-4000-e027-000000000002', 'SEC027 free', 'sec027-free', 'public',
   '00000000-0000-4000-e027-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'auto', false, null,
   'America/Los_Angeles', '00000000-0000-4000-b027-000000000002', false, 0);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a027-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.event_rsvps (event_id, profile_id, status, approval_status)
    values ('00000000-0000-4000-e027-000000000001', '00000000-0000-4000-b027-000000000001', 'going', 'none')$$,
  '42501', 'event_rsvps: this event sells tickets, so a seat comes with a ticket', 'a member cannot RSVP going to a ticketed event');

select lives_ok(
  $$insert into public.event_rsvps (event_id, profile_id, status, approval_status)
    values ('00000000-0000-4000-e027-000000000001', '00000000-0000-4000-b027-000000000001', 'not_going', 'none')$$,
  'a member can still say they are not going');

select throws_ok(
  $$update public.event_rsvps set status = 'going'
    where event_id = '00000000-0000-4000-e027-000000000001' and profile_id = '00000000-0000-4000-b027-000000000001'$$,
  '42501', 'event_rsvps: this event sells tickets, so a seat comes with a ticket', 'a member cannot flip their own row to going on a ticketed event');

select lives_ok(
  $$insert into public.event_rsvps (event_id, profile_id, status, approval_status)
    values ('00000000-0000-4000-e027-000000000002', '00000000-0000-4000-b027-000000000001', 'going', 'none')$$,
  'a free event still takes a member RSVP');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a027-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.event_rsvps (event_id, profile_id, status, approval_status)
    values ('00000000-0000-4000-e027-000000000001', '00000000-0000-4000-b027-000000000002', 'going', 'none')$$,
  'the host can still mark themselves going on their own ticketed event');

reset role;

select lives_ok(
  $$update public.event_rsvps set status = 'going'
    where event_id = '00000000-0000-4000-e027-000000000001' and profile_id = '00000000-0000-4000-b027-000000000001'$$,
  'a server write (ticket door, host comp) still seats the member');

select * from finish();
rollback;
