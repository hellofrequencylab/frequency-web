-- SCAN-1037: interpret event wall-clock UTC parts through the host zone before comparison.
-- Upcoming listings remain future-start-only; calendar feeds retain the one-day lookback.
-- Valid zones are materialized ONCE per RPC, not enumerated per event. Invalid zones use HOME.
-- Preserves publication, parent Space, removal, demo, share, token and venue-redaction gates.
-- public_events gains only time_zone; DROP is RESTRICT and all grants are restated explicitly.
-- No event rows or stored timestamps are rewritten. Rollback restores the prior RPC definitions.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

drop function if exists public.public_events(integer);
create or replace function public.public_events(_limit integer default 50)
returns table (
  id               uuid,
  slug             text,
  title            text,
  description      text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  city             text,
  circle_id        uuid,
  circle_name      text,
  price_cents      integer,
  parent_event_id  uuid,
  recurrence_type  text,
  time_zone        text
)
language sql
stable
security definer
set search_path = public
as $$
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  )

  select e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         -- The Circle's city first (unchanged for every Circle event that has one), then the
         -- event's own city, so a standalone event lists under its city. City level only.
         coalesce(nullif(trim(c.city), ''), nullif(trim(e.city), '')),
         c.id, c.name, e.price_cents,
         e.parent_event_id, e.recurrence_type, coalesce(tz.name, 'America/Los_Angeles')
  from   public.events e
  -- 🔴 LEFT, always. A standalone event has no circle (ADR-254) and must still list.
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  left join zones tz on tz.key = lower(e.time_zone)
  where  e.is_cancelled = false
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now()
    -- (1) a draft is owner-private regardless of visibility (20260613130000).
    and  coalesce(e.status, 'published') = 'published'
    -- (2) staff removal must reach the anon surface.
    and  e.removed_at is null
    -- (3) PUBLIC ONLY. This is a listing, and 'unlisted' is a link (ADR-202).
    --     Never circle_only, never private.
    and  e.visibility = 'public'
    -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    -- (5) discovery/crawl reads hard-exclude demo content.
    and  e.is_demo = false
  order by ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) asc, e.id asc
  limit  greatest(1, least(_limit, 200));
$$;
revoke execute on function public.public_events(integer) from public, anon, authenticated;
grant execute on function public.public_events(integer) to anon, authenticated, service_role;

create or replace function public.density_by_city()
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
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  ),
  ev as (
    -- The public_events city and gates (20270346008700), counted rather than listed.
    select coalesce(nullif(trim(c.city), ''), nullif(trim(e.city), '')) as city
    from   events e
    left join circles c
           on e.scope_type = 'circle' and e.scope_id = c.id
  left join zones tz on tz.key = lower(e.time_zone)
    where  e.is_cancelled = false
      and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now()
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

create or replace function public.public_calendar_feed()
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, recurrence_rule text, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  )

  select e.id, e.title, e.description,
         -- SCAN-209: the venue line only when the host has not hidden the address.
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, coalesce(tz.name, 'America/Los_Angeles') as time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   public.events e
  left join public.spaces s
         on s.id = e.space_id
  left join zones tz on tz.key = lower(e.time_zone)
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    and  e.visibility = 'public'
    -- SCAN-645: a staff-removed event is gone from the page and must be gone from the feed too,
    -- or it stays on every subscribed calendar until this predicate exists.
    and  e.removed_at is null
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now() - interval '1 day'
  order by ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) asc, e.id asc
  limit  500;
$function$;
revoke execute on function public.public_calendar_feed() from public, anon, authenticated;
grant execute on function public.public_calendar_feed() to service_role;

create or replace function public.space_public_calendar_feed(_space_id uuid)
returns table (
  id uuid, title text, description text, location text,
  starts_at timestamptz, ends_at timestamptz, slug text, is_cancelled boolean, time_zone text,
  recurrence_type text, recurrence_until timestamptz, recurrence_rule text, parent_event_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  ),
  target as (
    select s.id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )
  select feed.* from (
  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, coalesce(tz.name, 'America/Los_Angeles') as time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   target t
  join   public.events e
         on e.space_id = t.id
         or e.host_space_id = t.id
  left   join public.spaces home on home.id = e.space_id
  left join zones tz on tz.key = lower(e.time_zone)
  where  (e.space_id is null
          or e.space_id = t.id
          or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now() - interval '1 day'

  union

  select e.id, e.title, e.description,
         case when e.hide_address
              then nullif(concat_ws(', ', nullif(e.city, ''), nullif(e.region, '')), '')
              else e.location
         end as location,
         e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, coalesce(tz.name, 'America/Los_Angeles') as time_zone,
         e.recurrence_type, e.recurrence_until, e.recurrence_rule, e.parent_event_id
  from   target t
  join   public.event_space_shares sh on sh.space_id = t.id
  join   public.events e on e.id = sh.event_id
  left   join public.spaces home on home.id = e.space_id
  left join zones tz on tz.key = lower(e.time_zone)
  where  sh.status = 'accepted'
    and  (e.space_id is null or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now() - interval '1 day'

  ) feed
  order by ((feed.starts_at at time zone 'UTC') at time zone feed.time_zone) asc, feed.id asc
  limit 200;
$function$;
revoke execute on function public.space_public_calendar_feed(uuid) from public, anon, authenticated;
grant execute on function public.space_public_calendar_feed(uuid) to service_role;

create or replace function public.event_calendar_feed(_token text)
returns table (
  id           uuid,
  title        text,
  description  text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  slug         text,
  is_cancelled boolean,
  time_zone    text
)
language sql
stable
security definer
set search_path = public
as $$
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  )

  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, coalesce(tz.name, 'America/Los_Angeles') as time_zone
  from   public.event_calendar_follows f
  -- `status = 'going'` alone stopped meaning "attending" the day approval gating shipped: a request
  -- is stored as going + pending. Both halves are required for the seat to be real, and it is that
  -- pair — not the status alone — that entitles the holder to the venue (ADR-1152).
  join   public.event_rsvps r on r.profile_id = f.profile_id
                             and r.status = 'going'
                             and r.approval_status is distinct from 'pending'
  join   public.events e       on e.id = r.event_id
  left join zones tz on tz.key = lower(e.time_zone)
  where  f.token = _token
    and  e.is_cancelled = false
    -- SCAN-645: a removed event keeps its RSVP rows, so the seat alone is not enough to list it.
    and  e.removed_at is null
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now() - interval '1 day'
  order by ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) asc, e.id asc
  limit  200;
$$;
revoke execute on function public.event_calendar_feed(text) from public, anon, authenticated;
grant execute on function public.event_calendar_feed(text) to service_role;

create or replace function public.public_organizer_events(_handle text)
returns table (
  host_id           uuid,
  host_display_name text,
  host_handle       text,
  host_avatar_url   text,
  id                uuid,
  slug              text,
  title             text,
  description       text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  city              text,
  circle_id         uuid,
  circle_name       text,
  is_past           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with zones as materialized (
    select distinct on (lower(name)) lower(name) as key, name
    from pg_catalog.pg_timezone_names order by lower(name), name
  ), event_rows as (
    select e.*, coalesce(tz.name, 'America/Los_Angeles') as resolved_zone
    from public.events e left join zones tz on tz.key = lower(e.time_zone)
  )

  select
    p.id, p.display_name, p.handle, p.avatar_url,
    e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
    c.city, c.id, c.name,
    (((coalesce(e.ends_at, e.starts_at) at time zone 'UTC') at time zone e.resolved_zone) < now()) as is_past
  from   public.profiles p
  left join event_rows e
         on e.host_id = p.id
        and e.is_cancelled = false
        -- (1) a draft is owner-private regardless of visibility (20260613130000).
        and coalesce(e.status, 'published') = 'published'
        -- (2) staff removal must reach the indexed surface.
        and e.removed_at is null
        -- (3) PUBLIC ONLY. 'unlisted' is link-only (ADR-202) and this page is
        --     crawlable and sitemap-enumerated. Never circle_only/private.
        and e.visibility = 'public'
        -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
        --     Correlated EXISTS, not a chained join: it references only `e`, so it
        --     lives in this ON clause and the LEFT JOIN shape is preserved.
        and (e.space_id is null
             or exists (select 1 from public.spaces s
                        where s.id = e.space_id
                          and s.visibility = 'network'
                          and s.status = 'active'))
        -- discovery/crawl reads hard-exclude demo content.
        and e.is_demo = false
        -- Keep the past tail finite; far-back events aren't worth crawling.
        and ((coalesce(e.ends_at, e.starts_at) at time zone 'UTC') at time zone e.resolved_zone) >= now() - interval '180 days'
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  p.handle = _handle
    and  p.is_demo = false
  order by is_past asc, ((e.starts_at at time zone 'UTC') at time zone e.resolved_zone) asc, e.id asc
  limit  100;
$$;
revoke execute on function public.public_organizer_events(text) from public, anon, authenticated;
grant execute on function public.public_organizer_events(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
