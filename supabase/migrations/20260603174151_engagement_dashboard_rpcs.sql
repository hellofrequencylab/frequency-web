-- Engagement & Marketing Engine · Phase B (ADR-070). Generic, parameterized
-- aggregates over the event ledger for the janitor dashboard — "via SQL aggregates,
-- not raw scans" (ANALYTICS.md). Read by the admin client (service role). Applied via MCP.

-- Distinct actors + volume per event_type over a window.
create or replace function public.engagement_event_counts(_days int default 30)
returns table (event_type text, events bigint, actors bigint)
language sql stable as $$
  select e.event_type, count(*)::bigint, count(distinct e.actor_profile_id)::bigint
  from public.engagement_events e
  where e.created_at > now() - make_interval(days => _days)
  group by e.event_type
  order by count(*) desc;
$$;

-- Top values of a context property for an event (e.g. nav.page_view → path,
-- feature.used → feature). _prop is a bound parameter to the ->> operator (no
-- string concatenation), so it's injection-safe.
create or replace function public.engagement_prop_counts(_event text, _prop text, _days int default 30, _limit int default 10)
returns table (value text, n bigint)
language sql stable as $$
  select e.context->>_prop as value, count(*)::bigint
  from public.engagement_events e
  where e.event_type = _event
    and e.created_at > now() - make_interval(days => _days)
    and e.context->>_prop is not null
  group by e.context->>_prop
  order by count(*) desc
  limit _limit;
$$;
