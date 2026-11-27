-- pgTAP guard for "Only me" calendar entries (LIVE-2560, migration 20270346560000).
--
-- An only-me row is its maker's alone: a teammate who can write the Space's calendar cannot read,
-- edit or forge one, and sees the time only through space_personal_busy() (times, no title). The
-- maker reads their own row in full and is not handed it twice as Busy. Runs via `supabase test db`,
-- NOT under vitest.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a560-000000000001', 'onlyme-owner@test.local'),
  ('00000000-0000-4000-a560-000000000002', 'onlyme-mate@test.local');
insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b560-000000000001', '00000000-0000-4000-a560-000000000001', 'Only Me Owner', 'onlyme-owner'),
  ('00000000-0000-4000-b560-000000000002', '00000000-0000-4000-a560-000000000002', 'Only Me Mate', 'onlyme-mate');
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a560-000000000001', '00000000-0000-4000-a560-000000000002')
  and id not in ('00000000-0000-4000-b560-000000000001', '00000000-0000-4000-b560-000000000002');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c560-000000000001', 'onlyme-space', 'Only Me Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b560-000000000001', 'active', 'network');

insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c560-000000000001', '00000000-0000-4000-b560-000000000002', 'admin', 'active');

-- ── The owner adds a personal date ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a560-000000000001', 'role', 'authenticated')::text, true);

select lives_ok($$
  insert into public.space_calendar_entries
    (space_id, kind, title, notes, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, created_by)
  values ('00000000-0000-4000-c560-000000000001', 'private', 'Dentist', 'Bring the forms',
          false, '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z', 'America/Los_Angeles', false, 'only_me',
          '00000000-0000-4000-b560-000000000001')
$$, 'the owner saves an only-me date');

select results_eq($$
  select count(*)::int from public.space_calendar_entries where title = 'Dentist'
$$, $$ values (1) $$, 'the owner reads their own only-me date');

select results_eq($$
  select count(*)::int from public.space_personal_busy('00000000-0000-4000-c560-000000000001', '2026-12-01', '2026-12-05')
$$, $$ values (0) $$, 'the owner is not handed their own date again as Busy');

-- ── A teammate (Space admin) ─────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a560-000000000002', 'role', 'authenticated')::text, true);

select results_eq($$
  select count(*)::int from public.space_calendar_entries where title = 'Dentist'
$$, $$ values (0) $$, 'a teammate cannot read the only-me date');

select results_eq($$
  select starts_at, ends_at from public.space_personal_busy('00000000-0000-4000-c560-000000000001', '2026-12-01', '2026-12-05')
$$, $$ values ('2026-12-02T10:00:00Z'::timestamptz, '2026-12-02T11:00:00Z'::timestamptz) $$,
  'a teammate sees the time as Busy, and nothing else');

-- RLS hides the row from the teammate's UPDATE, so this touches nothing; the owner checks below.
update public.space_calendar_entries set title = 'Renamed' where visibility = 'only_me';

select throws_ok($$
  insert into public.space_calendar_entries
    (space_id, kind, title, all_day, starts_at, ends_at, time_zone, blocks_time, visibility, created_by)
  values ('00000000-0000-4000-c560-000000000001', 'private', 'Forged', false,
          '2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z', 'America/Los_Angeles', false, 'only_me',
          '00000000-0000-4000-b560-000000000001')
$$, '42501', NULL, 'a teammate cannot write an only-me date in someone else''s name');

-- ── Back to the owner: the teammate's edit changed nothing ───────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a560-000000000001', 'role', 'authenticated')::text, true);

select results_eq($$
  select title from public.space_calendar_entries where visibility = 'only_me'
$$, $$ values ('Dentist'::text) $$, 'a teammate cannot edit the only-me date');

select * from finish();
rollback;
