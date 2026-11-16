-- pgTAP guard for public.public_circles_page (migration 20270346066000, SCAN-1226) and for the small
-- advisor fixes in 20270346065000 (SCAN-1238), which have no behavior of their own to exercise.
--
-- public_circles clamps at 200 rows and takes no offset, so the sitemap could not name a circle past the
-- 200th. public_circles_page is the same list with an offset. Pinned here:
--
--   · anon may call it, and public_circles(integer) is still there and still callable;
--   · it clamps to 200 rows a call whatever is asked for, and clamps a null or negative argument;
--   · walked a page at a time it returns every listed circle exactly once;
--   · an unlisted or archived circle is on no page;
--   · an offset past the end is an empty page, not an error.
--
-- Counts are compared with the table's own predicate, not with literals, so circles another seed left behind
-- do not change the verdict.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

-- ── SCAN-1238: the two advisor fixes ────────────────────────────────────────────────────────────
select ok(
  (select coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = 'private.tz_names()'::regprocedure),
  'private.tz_names() pins its search_path'
);
select ok(
  (select count(*) > 300 from private.tz_names()),
  'and still returns the zone list'
);
select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'public'
      and indexname in ('hunt_missions_version_hunt_idx', 'hunt_rule_group_members_group_version_idx', 'hunts_id_current_version_idx')),
  3,
  'the three Hunts foreign keys each have an index on their own columns'
);

-- ── SCAN-1226: the paged reader ─────────────────────────────────────────────────────────────────
select is(
  has_function_privilege('anon', 'public.public_circles_page(integer, integer)', 'execute'),
  true, 'anon can reach public_circles_page');
select is(
  has_function_privilege('anon', 'public.public_circles(integer)', 'execute'),
  true, 'public_circles(integer) is untouched and still anon-callable');

-- 205 listed circles (so the list is certain to span two pages), plus two that must never appear.
insert into public.circles (name, slug, type, status, unlisted, access, created_at)
select 'S1226 ' || g, 's1226-' || g, 'online', 'active', false, 'open', now() - make_interval(secs => g)
  from generate_series(1, 205) g;
insert into public.circles (id, name, slug, type, status, unlisted, access) values
  ('00000000-0000-4000-e726-000000000001', 'S1226 unlisted', 's1226-unlisted', 'online', 'active', true, 'open'),
  ('00000000-0000-4000-e726-000000000002', 'S1226 archived', 's1226-archived', 'online', 'archived', false, 'open');

set local role anon;

select is(
  (select count(*)::int from public.public_circles_page(200, 0)), 200,
  'page one holds 200 rows');
select is(
  (select count(*)::int from public.public_circles_page(5000, 0)), 200,
  'a larger limit is clamped to 200');
select is(
  (select count(*)::int from public.public_circles_page(null, -5)), 200,
  'a null limit and a negative offset are clamped, not errors');
select is(
  (select count(*)::int from public.public_circles_page(200, 100000)), 0,
  'an offset past the end is an empty page');

reset role;

-- Walk every page the listed count needs, as the sitemap reader does.
create temporary table s1226_walk on commit drop as
select p.id
  from generate_series(0, (select count(*)::int / 200 from public.circles where status in ('forming', 'active') and not unlisted)) as pg(n)
 cross join lateral public.public_circles_page(200, pg.n * 200) as p;

select is(
  (select count(*)::int from s1226_walk),
  (select count(*)::int from public.circles where status in ('forming', 'active') and not unlisted),
  'the pages together hold every listed circle');
select is(
  (select count(distinct id)::int from s1226_walk),
  (select count(*)::int from s1226_walk),
  'and no circle is on two pages');
select is(
  (select count(*)::int from s1226_walk
    where id in ('00000000-0000-4000-e726-000000000001', '00000000-0000-4000-e726-000000000002')),
  0,
  'an unlisted circle and an archived circle are on no page');

select * from finish();
rollback;
