-- pgTAP guard for refresh_resonance_density_cells (migration 20270345000000): the nightly density
-- rollup must survive PostgREST's `safeupdate` preload.
--
-- WHY THIS FILE EXISTS. The function opened with a bare `delete from resonance_density_cells;`. From
-- psql that is fine. From the cron it never once succeeded: PostgREST connects as `authenticator`,
-- whose rolconfig carries `session_preload_libraries=safeupdate`, and safeupdate raises sqlstate
-- 21000 on any DELETE or UPDATE without a WHERE clause, for the whole session, through `set role`
-- and through SECURITY DEFINER alike. lib/resonance/density.ts collapsed the error into
-- { cells: 0 } and the cron logged that at info, so the rollup read as an empty success every night
-- from 2026-08-22 to 2026-09-04 (finding R2).
--
-- lib/resonance/density.test.ts pins the TypeScript half (an error is surfaced, not swallowed).
-- Only this file can pin the SQL half, because only here is the planner real: pgTAP runs as a
-- superuser, so `load 'safeupdate'` puts the very hook PostgREST's sessions carry into THIS session,
-- and the function is then called under the production condition rather than around it.
--
-- The detector control comes first: a bare DELETE on the same table must FAIL with 21000 once the
-- library is loaded. If that assertion ever passes green with a lives_ok, the library did not load
-- and the lives_ok on the function below proves nothing (ADR-970: a gate that cannot fire honestly
-- reads as coverage).
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

-- ── 0. The library that PostgREST's sessions carry, loaded into this one ─────────────────────────
load 'safeupdate';

-- ── 1. DETECTOR CONTROL: the hook is live in this session ────────────────────────────────────────
select throws_ok(
  $$ delete from public.resonance_density_cells $$,
  '21000',
  'DELETE requires a WHERE clause',
  'control: a bare DELETE on the rollup table fails with 21000 once safeupdate is loaded'
);

-- ── 2. The function body carries the tautology safeupdate accepts ───────────────────────────────
select matches(
  pg_get_functiondef('public.refresh_resonance_density_cells()'::regprocedure),
  'delete from public\.resonance_density_cells where true',
  'the full-rebuild delete has a WHERE clause'
);
select doesnt_match(
  pg_get_functiondef('public.refresh_resonance_density_cells()'::regprocedure),
  'delete from public\.resonance_density_cells;',
  'the bare DELETE is gone'
);

-- ── 3. THE BEHAVIOUR: the function runs to completion under safeupdate ──────────────────────────
-- Same session, same hook, the exact path the cron takes. Row count is not asserted (it depends on
-- whatever the local seed holds); completion without 21000 is the whole point.
select lives_ok(
  $$ select public.refresh_resonance_density_cells() $$,
  'refresh_resonance_density_cells() completes with safeupdate loaded'
);

-- ── 4. The ACL 20270345000000 restates: internal (scripts/function-grants.txt) ──────────────────
select is(
  (select prosecdef from pg_proc where oid = 'public.refresh_resonance_density_cells()'::regprocedure),
  true,
  'the function is SECURITY DEFINER'
);
select ok(
  not has_function_privilege('anon', 'public.refresh_resonance_density_cells()', 'EXECUTE'),
  'anon cannot execute the rollup'
);
select ok(
  not has_function_privilege('authenticated', 'public.refresh_resonance_density_cells()', 'EXECUTE'),
  'authenticated cannot execute the rollup'
);
select ok(
  has_function_privilege('service_role', 'public.refresh_resonance_density_cells()', 'EXECUTE'),
  'service_role can execute the rollup (the cron path)'
);

select * from finish();
rollback;
