-- refresh_resonance_density_cells() survives PostgREST's safeupdate (ADR-416, ADR-TBD, R2).
--
-- THE DEFECT, REPRODUCED LIVE. The nightly density rollup (20260822000000_resonance_density_rollup.sql)
-- opens with
--     delete from public.resonance_density_cells;
-- with no WHERE clause. That is legal SQL and it runs fine from psql or the SQL editor. It has NEVER
-- run through the cron, because the cron reaches it as an RPC over PostgREST, and PostgREST's
-- database role is different in one way that matters here:
--
--   select rolname, rolconfig from pg_roles where rolname = 'authenticator';
--   authenticator | {session_preload_libraries=safeupdate, ...}
--
-- `safeupdate` is a planner hook that raises sqlstate 21000 on any DELETE or UPDATE that has no
-- WHERE clause. It is loaded per SESSION, by the role the connection was opened as, and a session
-- keeps its preloaded libraries for its whole life. PostgREST connects as `authenticator` and then
-- `set role service_role` (or anon / authenticated) per request, so the role switch changes the
-- privilege check but NOT the loaded library. SECURITY DEFINER does not help either: it switches the
-- executing user inside the function, and the hook is still in the session's planner. So every
-- statement PostgREST runs, including the bare DELETE inside this SECURITY DEFINER plpgsql body, is
-- planned with safeupdate active.
--
-- The postgres_logs entry, 2026-09-04 02:31Z, one per cron run since 2026-08-22:
--   ERROR:  DELETE requires a WHERE clause   (sqlstate 21000)
--   CONTEXT: SQL statement "delete from public.resonance_density_cells"
--            PL/pgSQL function refresh_resonance_density_cells() line 7 at SQL statement
--
-- WHY NOBODY SAW IT. lib/resonance/density.ts caught the PostgREST error and returned { cells: 0 },
-- and app/api/cron/refresh-traits/route.ts logged that at info level. A rollup that wrote nothing
-- and a rollup that failed were the same line in the logs. That half is fixed beside this file
-- (the helper now returns `error`, the route logs it at error level); this file fixes the SQL half.
--
-- THE FIX. safeupdate accepts any WHERE clause, including a tautology, so the delete becomes
--     delete from public.resonance_density_cells where true;
-- which is how every other full-table write in this repo already does it (20260608060000 lifetime
-- rank, 20260614200000 rewards economy, 20260613000030 naming canon). Nothing else in the body
-- changes: the CTEs, the score weights, the comment and the return value are copied verbatim from
-- 20260822000000 so a diff between the two function bodies shows exactly one hunk: the delete line
-- plus the two comment lines above it.
--
-- ACL. `create or replace` preserves the existing ACL, so the grants are ALREADY right after the
-- replace. The revoke is repeated here anyway, role-explicit (ADR-959), plus the service_role grant
-- that Supabase's default privileges already supply, so the verdict in scripts/function-grants.txt
-- (`internal`: postgres and service_role execute, nobody else) is stated in this file rather than
-- inherited from one three hundred migrations back. Both statements are no-ops on the live catalog.
--
-- PRIVACY (unchanged, cardinal rule): counts only, keyed to FUZZED geocells, never a raw coordinate.
-- The table stays service-role only (RLS, no client policy).
--
-- House style: additive + idempotent (create or replace); SECURITY DEFINER + service-role only. No
-- em or en dashes. Ledger: apply through MCP, then repair the ledger row to THIS version
-- (supabase/migrations/README.md, the two-step protocol).

begin;

create or replace function public.refresh_resonance_density_cells()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- Full rebuild: the rollup is small (one row per ACTIVE cell) and recomputed nightly, so a
  -- delete-then-insert inside this function's transaction is simplest and leaves no stale cells.
  -- `where true` is the tautology safeupdate accepts (see the header): a bare DELETE fails with
  -- sqlstate 21000 on every PostgREST session, which is the only way the cron ever calls this.
  delete from public.resonance_density_cells where true;

  insert into public.resonance_density_cells
    (geocell_lat, geocell_lng, nexus_region_id, active_members, recent_posts, recent_events, recent_circles, density_score, computed_at)
  with
  -- Discoverable, real, non-ghost members homed in each cell (the people signal).
  members as (
    select home_geocell_lat as lat, home_geocell_lng as lng, count(*)::int as c
    from public.profiles
    where home_geocell_lat is not null and home_geocell_lng is not null
      and is_active = true
      and coalesce(is_demo, false) = false
      and coalesce(ghost_mode, false) = false
      and coalesce(discoverable_by, 'community') in ('community', 'connections')
    group by 1, 2
  ),
  -- Events with a location, recent or upcoming (the activity signal). Round the geography to the
  -- same 2dp grid the geocells use so they bucket together.
  ev as (
    select round(st_y(geog::geometry)::numeric, 2) as lat,
           round(st_x(geog::geometry)::numeric, 2) as lng,
           count(*)::int as c
    from public.events
    where geog is not null
      and coalesce(is_cancelled, false) = false
      and starts_at >= now() - interval '30 days'
    group by 1, 2
  ),
  -- Live circles with a location (the standing-community signal).
  ci as (
    select round(st_y(geog::geometry)::numeric, 2) as lat,
           round(st_x(geog::geometry)::numeric, 2) as lng,
           count(*)::int as c
    from public.circles
    where geog is not null
      and coalesce(status, 'active') <> 'archived'
    group by 1, 2
  ),
  -- Recent top-level posts by members homed in each cell (the chatter signal).
  po as (
    select pr.home_geocell_lat as lat, pr.home_geocell_lng as lng, count(*)::int as c
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where pr.home_geocell_lat is not null and pr.home_geocell_lng is not null
      and p.parent_id is null
      and p.hidden_at is null
      and p.created_at >= now() - interval '14 days'
    group by 1, 2
  ),
  -- Every cell that has ANY signal.
  keys as (
    select lat, lng from members
    union select lat, lng from ev
    union select lat, lng from ci
    union select lat, lng from po
  )
  select
    k.lat,
    k.lng,
    -- nexus_region_id mapping (point in region) is deferred; the ring-walk uses geocell distance for
    -- now, and the column stays nullable for a later precise mapping.
    null::uuid,
    coalesce(m.c, 0),
    coalesce(po.c, 0),
    coalesce(ev.c, 0),
    coalesce(ci.c, 0),
    -- A single 0..1 density score: standing circles weigh most, then events, then members, then
    -- chatter. ~20 weighted units of activity reads as a fully alive cell. Tunable.
    least(1.0, (coalesce(m.c, 0) * 1.0 + coalesce(ci.c, 0) * 3.0 + coalesce(ev.c, 0) * 2.0 + coalesce(po.c, 0) * 0.25) / 20.0),
    now()
  from keys k
  left join members m on m.lat = k.lat and m.lng = k.lng
  left join ev on ev.lat = k.lat and ev.lng = k.lng
  left join ci on ci.lat = k.lat and ci.lng = k.lng
  left join po on po.lat = k.lat and po.lng = k.lng;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.refresh_resonance_density_cells() is
  'Rebuilds resonance_density_cells: per fuzzed-geocell active_members + recent_posts + recent_events + recent_circles + a 0..1 density_score, for the adaptive-radius feed (ADR-416). Counts only, fuzzed cells only. SECURITY DEFINER, service-role only. Returns the cell count written.';

-- Service-role only (the nightly cron calls it through the service key). `create or replace` kept
-- the ACL; these restate it, role-explicit, so this file carries its own verdict (ADR-959).
revoke all on function public.refresh_resonance_density_cells() from public, anon, authenticated;
grant execute on function public.refresh_resonance_density_cells() to service_role;

commit;

-- Rollback: re-run the `create or replace function public.refresh_resonance_density_cells()` block
-- of 20260822000000_resonance_density_rollup.sql (the bare DELETE comes back, and so does the
-- 21000 on every cron run; there is no reason to want that). The function is never dropped here.
