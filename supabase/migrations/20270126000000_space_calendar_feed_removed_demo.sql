-- =====================================================================
-- The space .ics feed gates staff removal and demo content
-- (completes ADR-905's gate; same defence-in-depth call as ADR-899/903)
--
-- NARROWING ONLY. The 20270125 body gated published + public/unlisted +
-- non-cancelled, but not `removed_at` or `is_demo` — the same two holes
-- ADR-899 and ADR-903 closed on the discover RPCs one day earlier.
--
-- In practice the removal hole was MASKED: removeEvent
-- (lib/events/event-drafts.ts) also sets is_cancelled today, so a removed
-- event fell out of the feed anyway. But that is one function's courtesy,
-- not a contract, and this feed is handed to anonymous .ics subscribers.
-- The next removal path that does not set is_cancelled would put a
-- staff-removed event back on a public calendar file with nothing to catch
-- it. is_demo is the same argument via seeding: demo_mode has defaulted
-- off since 20260817000000, so the expected row delta is ~0 — the gate is
-- for what gets created tomorrow, not what exists today.
--
-- Both gates are applied on the event's OWN row in BOTH branches, matching
-- the app-side readers (listSpaceCalendarEvents / passesCalendarGate in
-- lib/events/store.ts, changed in lockstep in the same commit). Membership
-- (ADR-905: tenancy, host_space_id, accepted shares) is unchanged.
--
-- DROP first, matching 20270122000000/20270125000000: 42P13 has bitten this
-- function on prod before (2026-07-26). Grants re-applied below.
-- =====================================================================

drop function if exists public.space_public_calendar_feed(uuid);

create function public.space_public_calendar_feed(_space_id uuid)
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
  with target as (
    -- The subscribed space itself must be network-visible + active, or the
    -- whole feed is empty (the walling contract lives HERE, in-function,
    -- because the route hands this to anonymous subscribers).
    --
    -- owner_profile_id is deliberately NOT selected: nothing below may key
    -- membership on who owns this Space (ADR-905).
    select s.id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )

  -- 1) Events that BELONG on this space's calendar: the event is homed here
  --    (tenancy), or it NAMES this space as its host (ADR-905).
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   target t
  join   public.events e
         on e.space_id = t.id
         or e.host_space_id = t.id
  left   join public.spaces home on home.id = e.space_id
  where  (e.space_id is null
          or e.space_id = t.id
          or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    -- staff removal must reach the anon surface, independent of is_cancelled.
    and  e.removed_at is null
    -- seeded fictional events never reach a subscribable public calendar.
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  union

  -- 2) Events ACCEPTED-shared TO this space (EC3). The share stays
  --    necessary-but-not-sufficient: the event's OWN gate and its HOME
  --    space's walling both apply.
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   target t
  join   public.event_space_shares sh on sh.space_id = t.id
  join   public.events e on e.id = sh.event_id
  left   join public.spaces home on home.id = e.space_id
  where  sh.status = 'accepted'
    and  (e.space_id is null or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.removed_at is null
    and  e.is_demo = false
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$$;

grant execute on function public.space_public_calendar_feed(uuid) to anon, authenticated;

comment on function public.space_public_calendar_feed(uuid) is
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800) UNIONed with events accepted-shared to it (EC3). Membership (ADR-905, narrowing ADR-898) is three DECLARATIONS and never an inference: tenancy (space_id), the hosting axis (host_space_id), and accepted shares. Never lists circle_only/private/draft/cancelled/staff-removed/demo: the event''s OWN gate (including removed_at and is_demo, added 20270126000000) is re-applied in EVERY branch, so membership is necessary but never sufficient. The TARGET space must be network+active (in-function walling), and every event''s HOME space must be network+active too (tenancy-local and platform rows excepted). Carries recurrence_type/recurrence_until/parent_event_id so the .ics route collapses a series to one RRULE VEVENT + EXDATE (EC4, ADR-807). Anon-callable, self-gated in-function.';
