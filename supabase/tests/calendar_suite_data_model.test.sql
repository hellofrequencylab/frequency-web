-- THE CALENDAR SUITE DATA MODEL (20270346027000_calendar_suite_data_model.sql · LIVE-1703 · pass 2).
--
-- Proves, under real roles:
--   TO-DOS: phase, est_minutes and start_minute take their values and refuse the ones outside their checks.
--   PLANS: hold_until is a date that can be set and cleared.
--   ENTRY AS SUBJECT: a standalone calendar entry is a valid subject of the Plan record and the Plan
--     thread. Exactly one of plan_id / entry_id (a row with both, or neither, is refused), and an
--     entry comment cannot name a to-do.
--   ADMITTED: the Space team that can write the entry reads and writes its history and thread, and
--     the author takes back their own comment through the unchanged remove_plan_comment().
--   REFUSED: a Space cannot write to another Space's entry, nor name another Space as the author's
--     Space, nor sign another person's name; a stranger reads nothing; anon is off the table.
--   A RECORD: still no update and no delete policy on either table.
--   CASCADE: deleting the entry deletes its record and its thread.
--
-- One transaction, rolled back: nothing persists. Fixture style follows space_plan_comments.test.sql.

begin;
select plan(25);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a700-000000000001', 'csd-owner@test.local'),
  ('00000000-0000-4000-a700-000000000002', 'csd-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b700-000000000001', '00000000-0000-4000-a700-000000000001', 'CSD Owner', 'csd-owner'),
  ('00000000-0000-4000-b700-000000000002', '00000000-0000-4000-a700-000000000002', 'CSD Stranger', 'csd-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a700-000000000001',
    '00000000-0000-4000-a700-000000000002')
  and id not in (
    '00000000-0000-4000-b700-000000000001',
    '00000000-0000-4000-b700-000000000002');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c700-00000000000a', 'csd-owner-space', 'CSD Owner Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b700-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c700-00000000000b', 'csd-stranger-space', 'CSD Stranger Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b700-000000000002', 'active', 'network');

insert into public.space_plans (id, space_id, title, stage) values
  ('00000000-0000-4000-e700-000000000001', '00000000-0000-4000-c700-00000000000a', 'CSD Autumn retreat', 'pencil');

insert into public.crm_tasks (id, space_id, plan_id, title) values
  ('00000000-0000-4000-f700-000000000001', '00000000-0000-4000-c700-00000000000a',
   '00000000-0000-4000-e700-000000000001', 'Book the hall');

-- Two standalone entries: the owner's, and the stranger's.
insert into public.space_calendar_entries
  (id, space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, created_by)
values
  ('00000000-0000-4000-d700-000000000001', '00000000-0000-4000-c700-00000000000a', 'pencil', 'CSD Supper club', false,
   '2026-11-05T02:00:00Z', '2026-11-05T04:00:00Z', 'America/Los_Angeles', false, 'team',
   '00000000-0000-4000-b700-000000000001'),
  ('00000000-0000-4000-d700-000000000002', '00000000-0000-4000-c700-00000000000b', 'pencil', 'CSD Other supper', false,
   '2026-11-06T02:00:00Z', '2026-11-06T04:00:00Z', 'America/Los_Angeles', false, 'team',
   '00000000-0000-4000-b700-000000000002');

-- A fresh local stack lacks the hosted platform's default grants; the POLICIES are under test.
grant select, insert, update, delete on
  public.space_plans, public.crm_tasks, public.spaces, public.space_calendar_entries
to anon, authenticated;
grant select, insert, update, delete on public.space_plan_comments, public.space_plan_activity to authenticated;

-- ── To-do columns (as postgres) ──────────────────────────────────────────────────────────────────

select lives_ok(
  $$ update public.crm_tasks set phase = 'before', est_minutes = 90, start_minute = 600
     where id = '00000000-0000-4000-f700-000000000001' $$,
  'a to-do takes a phase, an estimate and a start minute');

select results_eq(
  $$ select phase, est_minutes, start_minute from public.crm_tasks
     where id = '00000000-0000-4000-f700-000000000001' $$,
  $$ values ('before'::text, 90, 600::smallint) $$,
  'the three values read back');

select throws_ok(
  $$ update public.crm_tasks set phase = 'someday' where id = '00000000-0000-4000-f700-000000000001' $$,
  '23514', null, 'a phase outside before, day_of, after is refused');

select throws_ok(
  $$ update public.crm_tasks set est_minutes = -1 where id = '00000000-0000-4000-f700-000000000001' $$,
  '23514', null, 'a negative estimate is refused');

select throws_ok(
  $$ update public.crm_tasks set start_minute = 1440 where id = '00000000-0000-4000-f700-000000000001' $$,
  '23514', null, 'a start minute past 23:59 is refused');

select lives_ok(
  $$ update public.crm_tasks set phase = null, est_minutes = null, start_minute = null
     where id = '00000000-0000-4000-f700-000000000001' $$,
  'all three can be cleared back to null');

-- ── Plan hold (as postgres) ──────────────────────────────────────────────────────────────────────

select lives_ok(
  $$ update public.space_plans set hold_until = '2026-11-04' where id = '00000000-0000-4000-e700-000000000001' $$,
  'a Plan takes a hold date');

select results_eq(
  $$ select hold_until::text from public.space_plans where id = '00000000-0000-4000-e700-000000000001' $$,
  $$ values ('2026-11-04') $$,
  'the hold date reads back as a day');

-- ── One subject (as postgres) ────────────────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.space_plan_activity (plan_id, entry_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-e700-000000000001', '00000000-0000-4000-d700-000000000001',
             '00000000-0000-4000-c700-00000000000a', 'field', 'both subjects') $$,
  '23514', null, 'a record about a Plan AND an entry is refused');

select throws_ok(
  $$ insert into public.space_plan_activity (actor_space_id, kind, summary)
     values ('00000000-0000-4000-c700-00000000000a', 'field', 'no subject') $$,
  '23514', null, 'a record about neither is refused');

select throws_ok(
  $$ insert into public.space_plan_comments (entry_id, task_id, space_id, body)
     values ('00000000-0000-4000-d700-000000000001', '00000000-0000-4000-f700-000000000001',
             '00000000-0000-4000-c700-00000000000a', 'a to-do thread on an entry') $$,
  '23514', null, 'a comment on an entry cannot name a to-do');

select col_is_null('public', 'space_plan_comments', 'plan_id', 'plan_id allows null now that an entry can be the subject');

-- ── Seat 1: the owner of the entry's Space ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a700-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into space_plan_comments (id, entry_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-9700-000000000001', '00000000-0000-4000-d700-000000000001',
             '00000000-0000-4000-c700-00000000000a', '00000000-0000-4000-b700-000000000001',
             'Doors at seven?') $$,
  'the Space team writes a comment under its own standalone entry');

select lives_ok(
  $$ insert into space_plan_activity (entry_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-d700-000000000001', '00000000-0000-4000-b700-000000000001',
             '00000000-0000-4000-c700-00000000000a', 'field', 'Moved the start to 7 PM.') $$,
  'the Space team records a change to its own standalone entry');

select results_eq(
  $$ select (select count(*) from space_plan_comments where entry_id = '00000000-0000-4000-d700-000000000001')::int,
            (select count(*) from space_plan_activity where entry_id = '00000000-0000-4000-d700-000000000001')::int $$,
  $$ values (1, 1) $$,
  'it reads both back');

select throws_ok(
  $$ insert into space_plan_comments (entry_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d700-000000000002', '00000000-0000-4000-c700-00000000000a',
             '00000000-0000-4000-b700-000000000001', 'On somebody else''s entry') $$,
  '42501', null, 'a comment on another Space''s entry is refused');

select throws_ok(
  $$ insert into space_plan_comments (entry_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d700-000000000001', '00000000-0000-4000-c700-00000000000b',
             '00000000-0000-4000-b700-000000000001', 'From a Space that is not mine') $$,
  '42501', null, 'a comment cannot name a Space the caller does not write');

select throws_ok(
  $$ insert into space_plan_comments (entry_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d700-000000000001', '00000000-0000-4000-c700-00000000000a',
             '00000000-0000-4000-b700-000000000002', 'Signed as the stranger') $$,
  '42501', null, 'a comment cannot be signed with another person''s name');

select results_eq(
  $$ select public.remove_plan_comment('00000000-0000-4000-9700-000000000001') $$,
  $$ values (true) $$,
  'the author takes back their own entry comment');

-- ── Seat 2: a stranger's Space ───────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a700-000000000002', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from space_plan_comments where entry_id = '00000000-0000-4000-d700-000000000001'
     union all
     select id from space_plan_activity where entry_id = '00000000-0000-4000-d700-000000000001' $$,
  'a stranger reads neither the thread nor the record of someone else''s entry');

-- ── anon: off the table ──────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select id from space_plan_comments $$,
  '42501', 'permission denied for table space_plan_comments',
  'anon has no grant on the thread');

-- ── The catalog, and the cascade (as postgres) ───────────────────────────────────────────────────
reset role;

select is_empty(
  $$ select tablename from pg_policies
     where schemaname = 'public' and tablename in ('space_plan_comments', 'space_plan_activity')
       and cmd in ('UPDATE', 'DELETE') $$,
  'still no UPDATE or DELETE policy on the thread or the record: both are records');

select is(
  has_function_privilege('anon', 'private.can_write_entry(uuid, uuid)', 'execute'), false,
  'anon cannot execute can_write_entry');

select is(
  has_function_privilege('authenticated', 'private.can_write_entry(uuid, uuid)', 'execute'), true,
  'a signed-in caller can execute can_write_entry');

delete from public.space_calendar_entries where id = '00000000-0000-4000-d700-000000000001';

select results_eq(
  $$ select (select count(*) from public.space_plan_comments where entry_id = '00000000-0000-4000-d700-000000000001')::int,
            (select count(*) from public.space_plan_activity where entry_id = '00000000-0000-4000-d700-000000000001')::int $$,
  $$ values (0, 0) $$,
  'deleting the entry deletes its thread and its record');

select * from finish();
rollback;
