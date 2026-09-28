-- pgTAP guard for the seventh standing count (migration 20270345009300, LIVE-456).
--
-- Three things are pinned: the column exists with the shape the rollup writes (integer, not null,
-- default 0, so a row written before the first pass after this applies reads 0 rather than NULL),
-- the table comment no longer claims attendance is absent (the promise 20270345003100 made is the
-- one this migration keeps, and a comment that still denied the column would send the next reader
-- the wrong way), and the table stays service-role only: no client policy grew beside the column.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(6);

select has_column('public', 'space_standing', 'attendance',
  'space_standing.attendance exists');
select col_type_is('public', 'space_standing', 'attendance', 'integer',
  'attendance is an integer count');
select col_not_null('public', 'space_standing', 'attendance',
  'attendance is not null (0 before the first pass, never NULL)');
select col_default_is('public', 'space_standing', 'attendance', 0,
  'attendance defaults to 0');

select unalike(
  obj_description('public.space_standing'::regclass, 'pg_class'),
  '%deliberately absent%',
  'the table comment no longer says attendance is deliberately absent');

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'space_standing'),
  0,
  'space_standing still carries no client policy (service-role only, as 20270345003100 left it)');

select * from finish();
rollback;
