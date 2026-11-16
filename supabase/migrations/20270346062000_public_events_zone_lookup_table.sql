-- SCAN-1210 (root cause): public.public_events(200) still ran ~300 ms and was the source of the 57014 timeouts.
-- EXPLAIN shows the zone list is a materialized CTE the planner joins with a nested loop (it estimates one event
-- row), so 491 events x 509 zone names = ~250,000 comparisons per call. A keyed table turns that into 491 index
-- lookups. The function body is otherwise unchanged; only the zones CTE and its join are swapped.
--
-- Additive and idempotent. ROLLBACK: re-create public.public_events from 20270346028100_event_rpcs_stop_scanning_timezone_names.sql;
-- drop table if exists public.tz_zone_lookup.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- tz_names() lives in schema private (20270346028100); the lookup is a plain public table, service role only, like every other internal table.

create table if not exists public.tz_zone_lookup (key text primary key, name text not null);
alter table public.tz_zone_lookup enable row level security;
revoke all on table public.tz_zone_lookup from public, anon, authenticated;

insert into public.tz_zone_lookup (key, name)
select distinct on (lower(name)) lower(name), name
from private.tz_names()
where name <> 'Factory'
order by lower(name), name
on conflict (key) do nothing;

create or replace function public.public_events(_limit integer default 50)
returns table(id uuid, slug text, title text, description text, starts_at timestamptz, ends_at timestamptz,
  city text, circle_id uuid, circle_name text, price_cents integer, parent_event_id uuid,
  recurrence_type text, time_zone text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         coalesce(nullif(trim(c.city), ''), nullif(trim(e.city), '')),
         c.id, c.name, e.price_cents,
         e.parent_event_id, e.recurrence_type, coalesce(tz.name, 'America/Los_Angeles')
  from   public.events e
  -- LEFT, always. A standalone event has no circle (ADR-254) and must still list.
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  left join public.tz_zone_lookup tz on tz.key = lower(e.time_zone)
  where  e.is_cancelled = false
    and  ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) >= now()
    and  coalesce(e.status, 'published') = 'published'
    and  e.removed_at is null
    and  e.visibility = 'public'
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    and  e.is_demo = false
  order by ((e.starts_at at time zone 'UTC') at time zone coalesce(tz.name, 'America/Los_Angeles')) asc, e.id asc
  limit  greatest(1, least(_limit, 200));
$function$;

commit;
