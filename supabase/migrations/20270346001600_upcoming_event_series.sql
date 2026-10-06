-- upcoming_event_series: the 3-slot events blocks count SERIES, not dates (LIVE-731, SERIES-PD).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- The Channel strip (components/events/upcoming-widget.tsx) and both branches of the rail events
-- panel (components/sidebar/rail-panels.tsx) took the next N rows and folded a repeating series to
-- one card in JS afterwards, so a daily series could fill the whole LIMIT and push every other event
-- off the block. This pushes the fold into SQL: DISTINCT ON (coalesce(parent_event_id, id)) keeps
-- the earliest upcoming date of each series, so the LIMIT counts series.
--
-- ONE SHARED FUNCTION (owner ruling on LIVE-731). Its arguments are the gate the three reads already
-- applied by hand: published, not cancelled, not removed, starting at or after the floor, in the
-- caller's visibility set, optionally inside a scope list. SECURITY INVOKER and executable by the
-- service role only: the callers read through the admin client today, and anon / authenticated get
-- no new surface to probe (no new leak-contract surface). The JS fold (collapseSeries) stays the
-- authority: over a list that is already one row per series it is the identity.
--
-- Additive and idempotent. REVERSIBLE: drop function public.upcoming_event_series(timestamptz,
-- integer, text[], uuid[], text[]); drop index public.events_upcoming_series_idx.

create index if not exists events_upcoming_series_idx
  on public.events ((coalesce(parent_event_id, id)), starts_at)
  where status = 'published' and is_cancelled = false and removed_at is null;

create or replace function public.upcoming_event_series(
  p_from         timestamptz,
  p_limit        integer,
  p_visibilities text[],
  p_scope_ids    uuid[] default null,
  p_scope_types  text[] default null
)
returns setof public.events
language sql
stable
security invoker
set search_path = public
as $$
  select s.*
  from (
    select distinct on (coalesce(e.parent_event_id, e.id)) e.*
    from public.events e
    where e.status = 'published'
      and e.is_cancelled = false
      and e.removed_at is null
      and e.starts_at >= p_from
      and e.visibility = any (p_visibilities)
      and (p_scope_ids is null or e.scope_id = any (p_scope_ids))
      and (p_scope_types is null or e.scope_type = any (p_scope_types))
    order by coalesce(e.parent_event_id, e.id), e.starts_at asc, e.id
  ) s
  order by s.starts_at asc, s.id
  limit least(greatest(coalesce(p_limit, 1), 1), 60);
$$;

comment on function public.upcoming_event_series(timestamptz, integer, text[], uuid[], text[]) is
  'Next upcoming date of each event series, LIMIT counted in series (LIVE-731). Service role only; the arguments are the visibility gate.';

revoke all on function public.upcoming_event_series(timestamptz, integer, text[], uuid[], text[]) from public, anon, authenticated;
grant execute on function public.upcoming_event_series(timestamptz, integer, text[], uuid[], text[]) to service_role;
