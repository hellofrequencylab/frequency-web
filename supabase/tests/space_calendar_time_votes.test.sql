-- pgTAP guard for public.space_calendar_time_votes (LIVE-2531, migration 20270346400000).
--
-- Find a time: the Space's team answers each candidate date of a Plan. This file measures the lock
-- on real rows under real RLS, which vitest cannot: the team reads every vote, a member writes and
-- changes only their own, an email vote cannot come from a session, and a stranger sees nothing.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

-- ── Fixture (seeded as postgres, which RLS does not bind) ───────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a253-000000000001', 'vote-owner@test.local'),
  ('00000000-0000-4000-a253-000000000002', 'vote-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b253-000000000001', '00000000-0000-4000-a253-000000000001', 'Vote Owner', 'vote-owner'),
  ('00000000-0000-4000-b253-000000000002', '00000000-0000-4000-a253-000000000002', 'Vote Stranger', 'vote-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a253-000000000001',
    '00000000-0000-4000-a253-000000000002')
  and id not in (
    '00000000-0000-4000-b253-000000000001',
    '00000000-0000-4000-b253-000000000002');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c253-000000000001', 'vote-space', 'Vote Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b253-000000000001', 'active', 'network');

-- Two candidate dates of one pencil.
insert into public.space_calendar_entries
  (id, space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, stage, option_group, created_by)
values
  ('00000000-0000-4000-d253-000000000001', '00000000-0000-4000-c253-000000000001', 'pencil', 'Spring Market', true,
   '2027-03-06T00:00:00Z', '2027-03-07T00:00:00Z', 'America/Los_Angeles', false, 'team', 'pencil',
   '00000000-0000-4000-e253-000000000001', '00000000-0000-4000-b253-000000000001'),
  ('00000000-0000-4000-d253-000000000002', '00000000-0000-4000-c253-000000000001', 'pencil', 'Spring Market', true,
   '2027-03-13T00:00:00Z', '2027-03-14T00:00:00Z', 'America/Los_Angeles', false, 'team', 'pencil',
   '00000000-0000-4000-e253-000000000001', '00000000-0000-4000-b253-000000000001');

-- An outside collaborator's vote, as the server writes it after verifying the email link.
insert into public.space_calendar_time_votes (space_id, entry_id, voter_email, voter_name, choice) values
  ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000002', 'venue@example.com', 'The Venue', 'yes');

-- ── Shape ───────────────────────────────────────────────────────────────────────────────────────
select is((select relrowsecurity from pg_class where oid = 'public.space_calendar_time_votes'::regclass), true,
  'row level security is on');
select is(has_table_privilege('anon', 'public.space_calendar_time_votes', 'select'), false,
  'anon cannot read votes');
select throws_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_profile_id, voter_email, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000001',
          '00000000-0000-4000-b253-000000000001', 'both@example.com', 'yes')
$$, '23514', NULL, 'a vote has exactly one voter');

-- ── Seat 1: the owner votes, changes their mind, and reads the team's votes ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a253-000000000001', 'role', 'authenticated')::text, true);

select lives_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_profile_id, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000001',
          '00000000-0000-4000-b253-000000000001', 'maybe')
$$, 'the owner answers a candidate date');

select throws_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_profile_id, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000001',
          '00000000-0000-4000-b253-000000000001', 'yes')
$$, '23505', NULL, 'a second answer on the same date is refused: changing your mind is an update');

select lives_ok($$
  update public.space_calendar_time_votes set choice = 'yes'
   where entry_id = '00000000-0000-4000-d253-000000000001'
     and voter_profile_id = '00000000-0000-4000-b253-000000000001'
$$, 'the owner changes their answer');

select results_eq($$
  select count(*)::int from public.space_calendar_time_votes where space_id = '00000000-0000-4000-c253-000000000001'
$$, $$ values (2) $$, 'the team reads every vote on its calendar, the email vote included');

select throws_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_email, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000001', 'forged@example.com', 'yes')
$$, '42501', NULL, 'a session cannot write an email vote');

select throws_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_profile_id, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000002',
          '00000000-0000-4000-b253-000000000002', 'no')
$$, '42501', NULL, 'nobody votes in someone else''s name');

-- ── Seat 2: a signed-in stranger ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a253-000000000002', 'role', 'authenticated')::text, true);

select results_eq($$
  select count(*)::int from public.space_calendar_time_votes
$$, $$ values (0) $$, 'a stranger reads no votes');

select throws_ok($$
  insert into public.space_calendar_time_votes (space_id, entry_id, voter_profile_id, choice)
  values ('00000000-0000-4000-c253-000000000001', '00000000-0000-4000-d253-000000000002',
          '00000000-0000-4000-b253-000000000002', 'yes')
$$, '42501', NULL, 'a stranger cannot vote on another Space''s dates');

reset role;
select results_eq($$
  select choice from public.space_calendar_time_votes
   where voter_profile_id = '00000000-0000-4000-b253-000000000001'
$$, $$ values ('yes'::text) $$, 'the owner''s one answer stands as they last gave it');

select * from finish();
rollback;
