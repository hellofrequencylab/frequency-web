-- Resonance Feed Phase 2 (ADR-416 - docs/RESONANCE-FEED-ARCHITECTURE.md §4). The rollup job that
-- fills resonance_density_cells: how much is happening in each fuzzed ~1.1km geocell, so the
-- adaptive-radius ("ripple") + the founder-vs-activity branch read ONE cheap indexed row instead of
-- counting members/posts/events live per request. Recomputed nightly off the same cron that refreshes
-- the resonance graph (app/api/cron/refresh-traits).
--
-- PRIVACY (cardinal rule): every signal is keyed to the FUZZED geocell (profiles.home_geocell_*, or
-- events/circles rounded to 2dp ~1.1km), NEVER a raw coordinate. Counts only, no identities. The
-- table itself is service-role only (RLS, no client policy), so the rollup never leaks who is where.
--
-- House style: additive + idempotent (create or replace); SECURITY DEFINER + service-role only. No
-- em or en dashes. Reached untyped until lib/database.types.ts regenerates (ADR-246).

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
  delete from public.resonance_density_cells;

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

-- Service-role only (the nightly cron calls it through the service key).
revoke all on function public.refresh_resonance_density_cells() from public, anon, authenticated;

-- Rollback: drop function public.refresh_resonance_density_cells();
