-- =============================================================================
-- Calendar feeds carry recurrence, so the FEEDS collapse a series to ONE RRULE VEVENT (Events EC4, ADR-807)
--
-- WHY: the per-event .ics already exports a recurring ANCHOR as ONE VEVENT + RRULE (EC4), but the
-- subscribable FEEDS (space_public_calendar_feed, public_calendar_feed) still emit the anchor AND every
-- materialized child occurrence as SEPARATE VEVENTs — correct but verbose, and it drifts from the "add
-- the whole series" behaviour of the per-event export. To let the .ics ROUTES dedupe a series to the
-- anchor + an RRULE (and EXDATE the missing/cancelled occurrences so they never resurrect), the feed
-- rows must carry the recurrence shape. This migration ONLY ADDS three columns to each feed RPC:
--   recurrence_type text, recurrence_until timestamptz, parent_event_id uuid.
--
-- LEAK CONTRACT — UNCHANGED. These two functions are the anon-callable, SECURITY DEFINER feed surfaces;
-- their WHERE clauses / JOINs / visibility gates ARE the tenancy boundary. This migration recreates each
-- with its EXACT current body (space_public_calendar_feed from 20261197000000 incl. the accepted-share
-- UNION branch + the home-space network+active gate; public_calendar_feed from 20261196000000 incl. the
-- public-only master gate and the LEFT JOIN platform-event allowance) and adds ONLY the three columns to
-- the RETURNS TABLE and the SELECT column list(s). No gate, join, filter, order, or limit changes. The
-- new columns are non-sensitive shape metadata already on the public event page; they leak nothing a
-- draft/private/cancelled event could ride out on, and the same rows still pass the same gates.
--
-- Reversible: re-run the 20261196000000 / 20261197000000 function bodies (drop the three columns).
-- =============================================================================

-- ── 1. space_public_calendar_feed — EC1 owned + EC3 accepted-share UNION, now carrying recurrence ────
-- Body is IDENTICAL to 20261197000000; only the RETURNS TABLE and BOTH union-branch SELECT lists gain
-- recurrence_type / recurrence_until / parent_event_id. Every WHERE clause, JOIN, the network+active
-- owning-space gate, the accepted-share branch's home-space gate, the order, and the limit are verbatim.
create or replace function public.space_public_calendar_feed(_space_id uuid)
returns table (
  id               uuid,
  title            text,
  description      text,
  location         text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  slug             text,
  is_cancelled     boolean,
  time_zone        text,
  recurrence_type  text,
  recurrence_until timestamptz,
  parent_event_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  -- 1) The space's OWN events (unchanged EC1 body: owning space must be network-visible + active).
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   public.events e
  join   public.spaces s
         on s.id = e.space_id
        and s.visibility = 'network'
        and s.status = 'active'
  where  e.space_id = _space_id
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'

  union

  -- 2) Events ACCEPTED-shared TO this space (EC3). The share is necessary but NOT sufficient: the
  --    event's OWN visibility gate is re-applied here, so a private/circle_only/draft/cancelled event
  --    never surfaces even with an accepted share. The event's HOME space is ALSO re-gated
  --    (network + active, with the platform-event `space_id IS NULL` allowance from public_calendar_feed):
  --    suspending or hiding the home space pulls its events from co-host feeds too, matching the owned
  --    branch above and the master feed. Without this, a share could out-live its home space's walling.
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   public.event_space_shares sh
  join   public.events e on e.id = sh.event_id
  left   join public.spaces home on home.id = e.space_id
  where  sh.space_id = _space_id
    and  sh.status = 'accepted'
    and  (e.space_id is null or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$$;

grant execute on function public.space_public_calendar_feed(uuid) to anon, authenticated;

comment on function public.space_public_calendar_feed(uuid) is
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800) UNIONed with events accepted-shared to it (EC3). Never lists circle_only/private/draft/cancelled: the event''s OWN visibility gate is re-applied in BOTH branches, so an accepted share is necessary but not sufficient. The event''s HOME space must be network+active in BOTH branches too (platform events with space_id IS NULL excepted), so a suspended/hidden home space drops its events from co-host feeds. Carries recurrence_type/recurrence_until/parent_event_id so the .ics route collapses a series to one RRULE VEVENT + EXDATE (EC4, ADR-807). Anon-callable, self-gated in-function.';


-- ── 2. public_calendar_feed — the master discovery feed, now carrying recurrence ─────────────────────
-- Body is IDENTICAL to 20261196000000; only the RETURNS TABLE and the SELECT list gain the three
-- recurrence columns. The PUBLIC-ONLY gate (never 'unlisted'), the LEFT JOIN platform-event allowance,
-- the owning-space network+active gate, the non-cancelled / published / upcoming filters, the order, and
-- the 500 limit are all verbatim.
create or replace function public.public_calendar_feed()
returns table (
  id               uuid,
  title            text,
  description      text,
  location         text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  slug             text,
  is_cancelled     boolean,
  time_zone        text,
  recurrence_type  text,
  recurrence_until timestamptz,
  parent_event_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   public.events e
  -- LEFT JOIN so a platform event (space_id IS NULL) survives; when a space owns the event, gate it on
  -- network-visible + active in the WHERE below (a walled-off space has no place in discovery).
  left join public.spaces s
         on s.id = e.space_id
  where  coalesce(e.status, 'published') = 'published'
    and  e.is_cancelled = false
    -- PUBLIC ONLY — the master feed is discovery, so 'unlisted' is excluded here (it is link-only, and
    -- still surfaces in its OWN space's feed). Never circle_only/private/draft.
    and  e.visibility = 'public'
    and  (e.space_id is null or (s.visibility = 'network' and s.status = 'active'))
    and  e.starts_at >= now() - interval '1 day'
  order by e.starts_at asc
  limit  500;
$$;

grant execute on function public.public_calendar_feed() to anon, authenticated;

comment on function public.public_calendar_feed() is
  'The master Frequency calendar: ALL upcoming published PUBLIC (never unlisted) non-cancelled events across the network, for the /events/calendar grid + master .ics (Events EC3, ADR-800). Platform events (space_id null) included; a space''s events only when it is network-visible + active. Carries recurrence_type/recurrence_until/parent_event_id so the .ics route collapses a series to one RRULE VEVENT + EXDATE (EC4, ADR-807). anon-callable, self-gated in-function (no credential, so the redaction contract lives entirely here).';
