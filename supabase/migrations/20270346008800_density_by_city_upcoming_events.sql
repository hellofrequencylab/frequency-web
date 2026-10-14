-- GEO-city-density (owner ruling 2026-10-14): the city activity read-model counts upcoming
-- public events.
--
-- public.density_by_city() supplies the per-city facts that lib/analytics/density.ts scores into
-- the readiness score, and app/discover/cities/_data.ts publishes a /discover/cities/<slug> page
-- only at score >= GROWING_SCORE. It counted circles, residents and listings but NO events, so a
-- city whose activity is mostly events (standalone events especially, ADR-254) never got a page.
--
-- THE ONE CHANGE: a new `upcoming_events` column, and event cities join the city key set so a
-- city with only events still returns a row. The score itself lives in TypeScript (ADR-151), so
-- the event weight is set there, not here.
--
-- Events are counted with EXACTLY the city derivation and gates of public.public_events as fixed
-- in 20270346008700_public_events_standalone_city.sql: city = the Circle's city when non-blank,
-- else the event's own city; not cancelled; starts_at >= now(); published; not removed;
-- visibility = 'public'; no Space or a network-visible active Space; not demo. A hide_address
-- event counts by its city (ADR-825 keeps city-level discovery; SCAN-209 kept events.city
-- readable). Only a count leaves this function, never a venue, street or geog.
--
-- Adding a column changes the RETURNS TABLE, which `create or replace` cannot do, so the function
-- is dropped and re-created in this one transaction. Every other column, the ordering, LANGUAGE,
-- STABLE, SECURITY DEFINER and search_path are copied from 20260608000000_density_demand_read_model.sql.
-- The only caller (getDensitySignal) reads columns by name and treats a missing upcoming_events as
-- 0, so the code works before and after this applies. The grants are re-stated exactly
-- (service_role only), and the revoke names anon and authenticated because a re-created function
-- picks up Supabase's default per-role grants again (ADR-959).
--
-- Verify after applying:
--   select city, upcoming_events from public.density_by_city() where upcoming_events > 0 order by 2 desc;
--   -- one row per city with an upcoming public event, including standalone-only cities.
--
-- ROLLBACK (manual): drop function public.density_by_city(); then re-run
-- 20260608000000_density_demand_read_model.sql.

drop function if exists public.density_by_city();

create function public.density_by_city()
returns table (
  city text,
  circles bigint,
  active_circles bigint,
  circle_members bigint,
  capacity bigint,
  residents bigint,
  new_residents_30d bigint,
  listings bigint,
  upcoming_events bigint
)
language sql stable security definer set search_path to 'public' as $$
  with ev as (
    -- The public_events city and gates (20270346008700), counted rather than listed.
    select coalesce(nullif(trim(c.city), ''), nullif(trim(e.city), '')) as city
    from   events e
    left join circles c
           on e.scope_type = 'circle' and e.scope_id = c.id
    where  e.is_cancelled = false
      and  e.starts_at >= now()
      and  coalesce(e.status, 'published') = 'published'
      and  e.removed_at is null
      and  e.visibility = 'public'
      and  (e.space_id is null
            or exists (select 1 from spaces s
                       where s.id = e.space_id
                         and s.visibility = 'network'
                         and s.status = 'active'))
      and  e.is_demo = false
  ),
  norm as (
    select lower(trim(city)) as key, max(trim(city)) as label
    from (
      select city from circles         where coalesce(trim(city), '') <> ''
      union all
      select city from profiles        where coalesce(trim(city), '') <> ''
      union all
      select city from market_listings where coalesce(trim(city), '') <> ''
      union all
      select city from ev              where city is not null
    ) s
    group by 1
  ),
  c as (
    select lower(trim(city)) as key,
      count(*) as circles,
      count(*) filter (where status = 'active') as active_circles,
      coalesce(sum(member_count), 0) as circle_members,
      coalesce(sum(member_cap), 0) as capacity
    from circles where coalesce(trim(city), '') <> '' group by 1
  ),
  p as (
    select lower(trim(city)) as key,
      count(*) as residents,
      count(*) filter (where created_at >= now() - interval '30 days') as new_residents_30d
    from profiles where coalesce(trim(city), '') <> '' group by 1
  ),
  m as (
    select lower(trim(city)) as key, count(*) as listings
    from market_listings where status = 'active' and coalesce(trim(city), '') <> '' group by 1
  ),
  x as (
    select lower(city) as key, count(*) as upcoming_events
    from ev where city is not null group by 1
  )
  select
    n.label,
    coalesce(c.circles, 0)::bigint,
    coalesce(c.active_circles, 0)::bigint,
    coalesce(c.circle_members, 0)::bigint,
    coalesce(c.capacity, 0)::bigint,
    coalesce(p.residents, 0)::bigint,
    coalesce(p.new_residents_30d, 0)::bigint,
    coalesce(m.listings, 0)::bigint,
    coalesce(x.upcoming_events, 0)::bigint
  from norm n
  left join c on c.key = n.key
  left join p on p.key = n.key
  left join m on m.key = n.key
  left join x on x.key = n.key
  order by coalesce(c.circle_members, 0) desc, coalesce(p.residents, 0) desc;
$$;

revoke execute on function public.density_by_city() from public, anon, authenticated;
grant execute on function public.density_by_city() to service_role;

comment on function public.density_by_city() is
  'Per-city density facts for the readiness score (ADR-151) and the /discover/cities gate: circles, members, capacity, residents, listings, and upcoming_events (counted with the public_events city and gates of 20270346008700: Circle city else event city; public, published, not cancelled, upcoming, not removed, not demo, Space wall). Counts only, never a venue. service_role only.';
