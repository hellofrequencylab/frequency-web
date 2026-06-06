-- Density / demand read-model (ADR-151, closes Stage B). The "where to seed the
-- next third space" surface off the place-tree (PLATFORM-VISION §6): one
-- deterministic SQL aggregate per city that joins supply (circles + capacity),
-- realized demand (members in circles), latent demand (residents on the platform
-- + recent arrivals), and local exchange (active marketplace listings). The
-- Lab-readiness SCORE is computed in TS (lib/analytics/density.ts) so the
-- expansion call stays auditable + testable; SQL only supplies the grounded facts
-- (same split as the mkt_* spine → marketing-forecast). Admin-only: revoked from
-- public, granted to service_role (read through the admin client at the page).
--
-- City is the clustering key because circles, profiles, and listings all carry a
-- free-text `city`; we normalize on lower(trim(city)) to join across the three and
-- surface a representative label. memberships has no created_at, so member growth
-- is read from profiles.created_at (new residents), not membership churn.

create or replace function public.density_by_city()
returns table (
  city text,
  circles bigint,
  active_circles bigint,
  circle_members bigint,
  capacity bigint,
  residents bigint,
  new_residents_30d bigint,
  listings bigint
)
language sql stable security definer set search_path to 'public' as $$
  with norm as (
    select lower(trim(city)) as key, max(trim(city)) as label
    from (
      select city from circles         where coalesce(trim(city), '') <> ''
      union all
      select city from profiles        where coalesce(trim(city), '') <> ''
      union all
      select city from market_listings where coalesce(trim(city), '') <> ''
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
  )
  select
    n.label,
    coalesce(c.circles, 0)::bigint,
    coalesce(c.active_circles, 0)::bigint,
    coalesce(c.circle_members, 0)::bigint,
    coalesce(c.capacity, 0)::bigint,
    coalesce(p.residents, 0)::bigint,
    coalesce(p.new_residents_30d, 0)::bigint,
    coalesce(m.listings, 0)::bigint
  from norm n
  left join c on c.key = n.key
  left join p on p.key = n.key
  left join m on m.key = n.key
  order by coalesce(c.circle_members, 0) desc, coalesce(p.residents, 0) desc;
$$;

revoke execute on function public.density_by_city() from public, anon, authenticated;
grant execute on function public.density_by_city() to service_role;
