-- Launch clock and buildout draft columns (20270346027300_launch_clock.sql, 20270346027400_launch_buildout_draft.sql,
-- LIVE-1873 and LIVE-1875). Proved against a real database with both migrations applied:
--   1. SHAPE: the three columns exist with the intended types; clock_active_ms defaults to 0 and is never null.
--   2. RANGE: the clock cannot go negative or past 100 hours; the buildout must be a JSON object.
--   3. OWNER-ONLY: the new columns inherit the owner policies, so a stranger cannot write another person's clock.
-- One transaction, rolled back: nothing persists.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a300-000000000001', 'clock-owner@test.local'),
  ('00000000-0000-4000-a300-000000000002', 'clock-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-a300-000000000001', 'Clock Owner', 'clock-owner'),
  ('00000000-0000-4000-b300-000000000002', '00000000-0000-4000-a300-000000000002', 'Clock Stranger', 'clock-stranger');

delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a300-000000000002')
  and id not in ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-b300-000000000002');

insert into public.space_launch (id, owner_id, space_id, steps) values
  ('00000000-0000-4000-d300-000000000001', '00000000-0000-4000-b300-000000000001', null, '{}'::jsonb);

-- 1. SHAPE
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'space_launch'
      and column_name in ('clock_active_ms', 'clock_last_beat_at', 'buildout')),
  3,
  'space_launch carries the clock and buildout columns'
);
select is(
  (select clock_active_ms from public.space_launch where id = '00000000-0000-4000-d300-000000000001'),
  0,
  'a new launch starts with no active time on the clock'
);

-- 2. RANGE
select throws_ok(
  $$update public.space_launch set clock_active_ms = -1 where id = '00000000-0000-4000-d300-000000000001'$$,
  '23514',
  null,
  'the clock cannot go negative'
);
select throws_ok(
  $$update public.space_launch set clock_active_ms = 360000001 where id = '00000000-0000-4000-d300-000000000001'$$,
  '23514',
  null,
  'the clock cannot run past 100 hours'
);
select lives_ok(
  $$update public.space_launch set clock_active_ms = 900000, clock_last_beat_at = now(), buildout = '{"mode":"rules","aiCalls":0}'::jsonb
    where id = '00000000-0000-4000-d300-000000000001'$$,
  'bonus time past 12 minutes and an object draft are accepted'
);
select throws_ok(
  $$update public.space_launch set buildout = '[1,2]'::jsonb where id = '00000000-0000-4000-d300-000000000001'$$,
  '23514',
  null,
  'the buildout must be a JSON object'
);

-- 3. OWNER-ONLY
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000002')::text, true);
select is(
  (select count(*)::int from public.space_launch where id = '00000000-0000-4000-d300-000000000001'),
  0,
  'a stranger reads no one else''s launch clock'
);
with changed as (
  update public.space_launch set clock_active_ms = 1 where id = '00000000-0000-4000-d300-000000000001' returning 1
)
select is((select count(*)::int from changed), 0, 'a stranger cannot write another person''s clock');

select * from finish();
reset role;
rollback;
