-- pgTAP guard: refresh_resonance_density_cells() runs under the `safeupdate` planner hook
-- (migration 20270345000000_density_refresh_safeupdate.sql, ADR-1207; pinned by scan2 phase A).
--
-- THE BUG THIS PINS. The nightly density rollup opened with a bare `delete from
-- public.resonance_density_cells`. PostgREST connects as `authenticator`, whose rolconfig carries
-- `session_preload_libraries=safeupdate`, and that library raises sqlstate 21000 on any DELETE or
-- UPDATE with no WHERE clause. The role switch to service_role does not unload it and SECURITY
-- DEFINER does not either, so the cron's RPC failed on every run from 2026-08-22 until the delete
-- gained a `where true`. psql never saw it, because psql never loads the hook.
--
-- So this file loads the hook itself and calls the function under it. That is the only way a test
-- can see the defect: without the hook, the original bare DELETE passes too.
--
-- LOADING MAY NOT BE ALLOWED. `load` needs superuser (or a library in $libdir/plugins), and the
-- library may be absent from the test image. Either way the test must not pass vacuously and must
-- not fail the suite for a reason unrelated to the function, so the load is attempted in a DO block
-- that catches the error, and when it cannot load every assertion below is SKIPPED with the reason
-- printed, loudly, in the TAP output. A positive control proves the hook is really active when the
-- load reports success: a bare DELETE on a scratch table must raise 21000 before the function is
-- trusted to have survived anything.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(4);

-- ── 0. Try to load the hook, recording success or the exact reason it could not ─────────────────
do $$
begin
  execute 'load ''safeupdate''';
  perform set_config('l7a.safeupdate_loaded', 'true', true);
  perform set_config('l7a.safeupdate_reason', '', true);
exception when others then
  perform set_config('l7a.safeupdate_loaded', 'false', true);
  perform set_config('l7a.safeupdate_reason', sqlstate || ': ' || sqlerrm, true);
end $$;

select diag(
  case when current_setting('l7a.safeupdate_loaded', true) = 'true'
    then 'safeupdate loaded: refresh_resonance_density_cells() is being exercised under the PostgREST planner hook'
    else 'SKIPPING: safeupdate could not be loaded in this database (' || current_setting('l7a.safeupdate_reason', true) || '). The ADR-1207 regression is NOT covered by this run.'
  end
);

create temporary table _l7a_control on commit drop as select 1 as n;

-- ── 1. Positive control: the hook is live in THIS session ───────────────────────────────────────
select case when current_setting('l7a.safeupdate_loaded', true) = 'true'
  then throws_ok(
    'delete from _l7a_control',
    '21000',
    null,
    'CONTROL: a bare DELETE raises sqlstate 21000 under safeupdate, so the hook is active for the assertions below'
  )
  else skip('safeupdate could not be loaded: ' || current_setting('l7a.safeupdate_reason', true), 1)
end;

-- ── 2. The function survives the hook ───────────────────────────────────────────────────────────
select case when current_setting('l7a.safeupdate_loaded', true) = 'true'
  then lives_ok(
    'select public.refresh_resonance_density_cells()',
    'refresh_resonance_density_cells() runs to completion under safeupdate (the bare DELETE of 20260822000000 would raise 21000 here)'
  )
  else skip('safeupdate could not be loaded: ' || current_setting('l7a.safeupdate_reason', true), 1)
end;

-- ── 3. And returns the integer cell count it promises ───────────────────────────────────────────
select case when current_setting('l7a.safeupdate_loaded', true) = 'true'
  then is(
    pg_typeof(public.refresh_resonance_density_cells())::text,
    'integer',
    'refresh_resonance_density_cells() returns an integer under safeupdate'
  )
  else skip('safeupdate could not be loaded: ' || current_setting('l7a.safeupdate_reason', true), 1)
end;

-- ── 4. The SHAPE of the fix, asserted whether or not the hook could load (HYG-122) ──────────────
-- Arms 1 to 3 have skipped on every db-tests run since this file was written: `load 'safeupdate'`
-- is refused (42501) for the role `supabase test db` connects as, and the skip read as coverage
-- until scripts/check-pgtap-skips.mjs started reading the TAP output. This arm never skips. It
-- asks the function's own definition the question safeupdate asks at plan time: is there a DELETE
-- with no WHERE clause? It is weaker than running under the hook (a WHERE that is present but wrong
-- passes here), which is why the file stays listed in scripts/pgtap-uncovered.txt with that
-- reason; but the 2026-08-22 defect, `delete from public.resonance_density_cells;`, fails it.
select doesnt_match(
  lower(regexp_replace(pg_get_functiondef('public.refresh_resonance_density_cells()'::regprocedure), '\s+', ' ', 'g')),
  'delete from [a-z_."]+ *;',
  'refresh_resonance_density_cells() carries no DELETE without a WHERE clause (the bare delete of 20260822000000 raised 21000 under safeupdate)'
);

-- Best effort: switch the hook off again for pgTAP's own bookkeeping. Newer safeupdate builds expose
-- this GUC; on older ones the SET lands on a placeholder and does nothing, which is fine, because
-- pgTAP's internal writes all carry a WHERE clause. Nothing below depends on it.
do $$
begin
  perform set_config('safeupdate.enabled', 'false', true);
exception when others then
  null;
end $$;

select * from finish();
rollback;
