-- =====================================================================
-- Space calendar carries HOSTED and CO-HOSTED events (ADR-898)
--
-- Owner report (2026-07-28): Danny Kenduck Coaching's calendar tab and .ics
-- feed rendered EMPTY while the Space's own events sat in the community
-- listings. The calendar's "owned" branch matched on `events.space_id`
-- alone, which is pure TENANCY (backfilled to ROOT for legacy rows,
-- ADR-819) — so none of the four ways a Space actually relates to an event
-- qualified it for the Space's calendar:
--
--   1. e.space_id       = the Space   (tenancy — the ONLY rule until now)
--   2. e.host_space_id  = the Space   (the explicit "Hosted by <space>"
--                                      axis, 20261218000000 — never read
--                                      by the calendar it was built for)
--   3. e.host_id        = the Space's owner (their personal hosted events;
--                                      a coach's community events ARE the
--                                      business's calendar)
--   4. an ACCEPTED event_cohosts row for the Space's owner
--
-- This migration widens MEMBERSHIP only. The visibility gate is untouched
-- and re-applied per row: published + public/unlisted + non-cancelled,
-- always on the event's OWN row. A circle_only or private event the owner
-- hosts still never surfaces on the public calendar.
--
-- The TARGET space is now gated once, explicitly (network + active): the
-- old body gated it implicitly via the space_id join, which the widened
-- membership would have silently dropped for branches 2-4. Every event's
-- HOME space is also re-gated (network + active, platform/tenancy-local
-- rows excepted) exactly like the accepted-share branch, so hosting or
-- co-hosting can never out-live a home space's walling.
--
-- DROP first: CREATE OR REPLACE cannot change a function's body shape
-- safely across signature-compatible redefinitions we may later widen
-- (42P13 caught on prod, 2026-07-26); grants are re-applied below.
--
-- (Version note: 20270121000000 is reserved by docs/EVENTS-SERIES-BUILD-PLAN.md
-- for the events-series settings migration; this file deliberately skips it.)
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
    select s.id, s.owner_profile_id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )

  -- 1) Events that BELONG on this space's calendar: tenancy, the hosting
  --    axis, or the owner's hosted / accepted-cohosted events (ADR-898).
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone,
         e.recurrence_type, e.recurrence_until, e.parent_event_id
  from   target t
  join   public.events e
         on e.space_id = t.id
         or e.host_space_id = t.id
         or (t.owner_profile_id is not null and e.host_id = t.owner_profile_id)
         or (t.owner_profile_id is not null and exists (
               select 1 from public.event_cohosts c
               where  c.event_id = e.id
                 and  c.profile_id = t.owner_profile_id
                 and  c.status = 'accepted'))
  left   join public.spaces home on home.id = e.space_id
  where  (e.space_id is null
          or e.space_id = t.id
          or (home.visibility = 'network' and home.status = 'active'))
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'

  union

  -- 2) Events ACCEPTED-shared TO this space (EC3) — verbatim from
  --    20261203000000, now gated on the target CTE like branch 1. The share
  --    stays necessary-but-not-sufficient: the event's OWN visibility gate
  --    and its HOME space's walling are both re-applied.
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
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$$;

grant execute on function public.space_public_calendar_feed(uuid) to anon, authenticated;

comment on function public.space_public_calendar_feed(uuid) is
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800) UNIONed with events accepted-shared to it (EC3). Membership (ADR-898): tenancy (space_id), the hosting axis (host_space_id), the owner''s hosted events (host_id = owner_profile_id), the owner''s ACCEPTED cohost invites, and accepted shares. Never lists circle_only/private/draft/cancelled: the event''s OWN visibility gate is re-applied in EVERY branch, so membership is necessary but never sufficient. The TARGET space must be network+active (in-function walling), and every event''s HOME space must be network+active too (tenancy-local and platform rows excepted). Carries recurrence_type/recurrence_until/parent_event_id so the .ics route collapses a series to one RRULE VEVENT + EXDATE (EC4, ADR-807). Anon-callable, self-gated in-function.';
