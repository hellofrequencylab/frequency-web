-- pgTAP guard for the meeting entry kind (LIVE-2533, migration 20270346520000).
--
-- The kind check gained exactly one value. A meeting saves with its agenda in description and its
-- notes in notes, a made-up kind is still refused, and a meeting never keeps a stage (the stage
-- belongs to an event on its way; the stage sync trigger clears it). Runs via `supabase test db`, NOT under vitest.

begin;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-4000-a533-000000000001', 'meeting-owner@test.local');
insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b533-000000000001', '00000000-0000-4000-a533-000000000001', 'Meeting Owner', 'meeting-owner');
delete from public.profiles
where auth_user_id = '00000000-0000-4000-a533-000000000001' and id <> '00000000-0000-4000-b533-000000000001';

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c533-000000000001', 'meeting-space', 'Meeting Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b533-000000000001', 'active', 'network');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a533-000000000001', 'role', 'authenticated')::text, true);

select lives_ok($$
  insert into public.space_calendar_entries
    (space_id, kind, title, description, notes, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, created_by)
  values ('00000000-0000-4000-c533-000000000001', 'meeting', 'Team call', '1. Winter dates', 'Dana: book the room by Friday',
          false, '2026-12-02T18:00:00Z', '2026-12-02T19:00:00Z', 'America/Los_Angeles', false, 'team',
          '00000000-0000-4000-b533-000000000001')
$$, 'the owner saves a meeting with an agenda and notes');

select results_eq($$
  select count(*)::int from public.space_calendar_entries where kind = 'meeting' and title = 'Team call'
$$, $$ values (1) $$, 'the meeting reads back on the team''s own session');

select throws_ok($$
  insert into public.space_calendar_entries
    (space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility)
  values ('00000000-0000-4000-c533-000000000001', 'party', 'Not a kind', true,
          '2026-12-03T00:00:00Z', '2026-12-04T00:00:00Z', 'America/Los_Angeles', false, 'team')
$$, '23514', NULL, 'a made-up kind is still refused');

select lives_ok($$
  insert into public.space_calendar_entries
    (space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, stage, created_by)
  values ('00000000-0000-4000-c533-000000000001', 'meeting', 'Staged meeting', true,
          '2026-12-03T00:00:00Z', '2026-12-04T00:00:00Z', 'America/Los_Angeles', false, 'team', 'pencil',
          '00000000-0000-4000-b533-000000000001')
$$, 'a meeting sent with a stage still saves');

-- The stage sync trigger (20270345005500) clears the stage on every kind but pencil before the
-- stage pairing check runs, so a meeting can never hold one.
select results_eq($$
  select count(*)::int from public.space_calendar_entries where title = 'Staged meeting' and stage is null
$$, $$ values (1) $$, 'a meeting never carries an event stage');

select * from finish();
rollback;
