-- pgTAP guard for public.split_calendar_series (LIVE-534, migration 20270345008800).
--
-- The function is the ONE write behind "This date only" on a repeating calendar entry: the master
-- gains the day in exception_dates and a new one-off row carries the edited values, together or
-- not at all. A half-written pair is the LIVE-531 loss with extra steps (a date that vanished) or
-- the same date drawn twice, so the atomicity is what this file measures, on real rows under real
-- RLS, which vitest cannot.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

-- ── Fixture (seeded as postgres, which RLS does not bind) ───────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a534-000000000001', 'split-owner@test.local'),
  ('00000000-0000-4000-a534-000000000002', 'split-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b534-000000000001', '00000000-0000-4000-a534-000000000001', 'Split Owner', 'split-owner'),
  ('00000000-0000-4000-b534-000000000002', '00000000-0000-4000-a534-000000000002', 'Split Stranger', 'split-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids
-- (the idiom money_trust_vera_deny.test.sql documents).
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a534-000000000001',
    '00000000-0000-4000-a534-000000000002')
  and id not in (
    '00000000-0000-4000-b534-000000000001',
    '00000000-0000-4000-b534-000000000002');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c534-000000000001', 'split-space', 'Split Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b534-000000000001', 'active', 'network');

-- A weekly Craft Night from Monday 2026-10-05, 7:30pm to 9:30pm wall clock, already skipping the 26th.
insert into public.space_calendar_entries
  (id, space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, stage,
   recurrence_rule, exception_dates, created_by)
values
  ('00000000-0000-4000-d534-000000000001', '00000000-0000-4000-c534-000000000001', 'pencil', 'Craft Night', false,
   '2026-10-05T19:30:00Z', '2026-10-05T21:30:00Z', 'America/Los_Angeles', false, 'team', 'pencil',
   'FREQ=WEEKLY', '{2026-10-26}', '00000000-0000-4000-b534-000000000001'),
  -- and a one-off, which has no series to split.
  ('00000000-0000-4000-d534-000000000002', '00000000-0000-4000-c534-000000000001', 'pencil', 'Open house', true,
   '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'America/Los_Angeles', false, 'team', 'pencil',
   null, '{}', '00000000-0000-4000-b534-000000000001');

-- ── The grant and the mode ──────────────────────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.split_calendar_series(uuid, uuid, date, jsonb)', 'execute'), false,
  'anon cannot execute split_calendar_series');
select is(has_function_privilege('authenticated', 'public.split_calendar_series(uuid, uuid, date, jsonb)', 'execute'), true,
  'a signed-in caller can execute split_calendar_series');
select is((select prosecdef from pg_proc where oid = 'public.split_calendar_series(uuid, uuid, date, jsonb)'::regprocedure), false,
  'split_calendar_series is SECURITY INVOKER, so the table''s RLS quad is still the lock');

-- ── Seat 1: the owner. The pair lands together. ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a534-000000000001', 'role', 'authenticated')::text, true);

select lives_ok($$
  select public.split_calendar_series(
    '00000000-0000-4000-c534-000000000001', '00000000-0000-4000-d534-000000000001', '2026-10-12',
    '{"title": "Craft Night (guest teacher)", "starts_at": "2026-10-12T18:00:00Z", "ends_at": "2026-10-12T20:00:00Z"}'::jsonb)
$$, 'the owner takes the 12th out of the series with its own details');

select results_eq(
  $$ select exception_dates::text[] from space_calendar_entries where id = '00000000-0000-4000-d534-000000000001' $$,
  $$ values (array['2026-10-12', '2026-10-26']) $$,
  'the master now skips the 12th, and keeps the skip it already had, ascending');

select results_eq($$
  select count(*)::int from space_calendar_entries
   where space_id = '00000000-0000-4000-c534-000000000001'
     and title = 'Craft Night (guest teacher)'
     and recurrence_rule is null
     and exception_dates = '{}'
     and option_group is null
     and published_event_id is null
     and removed_at is null
     and kind = 'pencil'
     and (starts_at at time zone 'UTC')::date = '2026-10-12'
     and created_by = '00000000-0000-4000-b534-000000000001'
$$, $$ values (1) $$,
  'the override is one one-off row on the 12th, with the edited values, no rule, no skips, by the caller');

-- ── Atomicity: a failing override leaves the series untouched. ──────────────────────────────────
-- An empty title violates the table''s own check, AFTER the exception has been stamped inside the
-- function. If the stamp survived, the 19th would have vanished with nothing in its place.
select throws_ok($$
  select public.split_calendar_series(
    '00000000-0000-4000-c534-000000000001', '00000000-0000-4000-d534-000000000001', '2026-10-19',
    '{"title": ""}'::jsonb)
$$, '23514', NULL, 'an override the table refuses raises');

select results_eq(
  $$ select exception_dates::text[] from space_calendar_entries where id = '00000000-0000-4000-d534-000000000001' $$,
  $$ values (array['2026-10-12', '2026-10-26']) $$,
  '🔴 and the 19th is NOT skipped: the stamp rolled back with the insert');

select results_eq($$
  select count(*)::int from space_calendar_entries
   where space_id = '00000000-0000-4000-c534-000000000001'
     and (starts_at at time zone 'UTC')::date = '2026-10-19'
$$, $$ values (0) $$,
  'and no row was left on the 19th');

-- ── Refusals ────────────────────────────────────────────────────────────────────────────────────
select throws_ok($$
  select public.split_calendar_series(
    '00000000-0000-4000-c534-000000000001', '00000000-0000-4000-d534-000000000001', '2026-10-26',
    '{"title": "Twice"}'::jsonb)
$$, 'P0001', NULL, 'a day the series already skips cannot be split again');

select throws_ok($$
  select public.split_calendar_series(
    '00000000-0000-4000-c534-000000000001', '00000000-0000-4000-d534-000000000002', '2026-11-01',
    '{"title": "Not a series"}'::jsonb)
$$, 'P0001', NULL, 'a one-off entry has no series to split');

-- ── Seat 2: a signed-in stranger. RLS hides the row, so there is nothing to split. ─────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a534-000000000002', 'role', 'authenticated')::text, true);

select throws_ok($$
  select public.split_calendar_series(
    '00000000-0000-4000-c534-000000000001', '00000000-0000-4000-d534-000000000001', '2026-11-02',
    '{"title": "Hijack"}'::jsonb)
$$, 'P0001', NULL, 'a stranger cannot split a series they cannot see');

reset role;
select results_eq(
  $$ select exception_dates::text[] from space_calendar_entries where id = '00000000-0000-4000-d534-000000000001' $$,
  $$ values (array['2026-10-12', '2026-10-26']) $$,
  'the stranger''s attempt left the series as it was');

select results_eq($$
  select count(*)::int from space_calendar_entries where title = 'Hijack'
$$, $$ values (0) $$,
  'and wrote no row');

select * from finish();
rollback;
