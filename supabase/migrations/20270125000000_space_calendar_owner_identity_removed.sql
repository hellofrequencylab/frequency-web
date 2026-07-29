-- =====================================================================
-- A Space calendar shows what the SPACE offers, not what its OWNER does
-- (ADR-905 — narrows ADR-898)
--
-- Owner report (2026-07-29): the Breathe & Shine calendar listed "Swami's
-- Beach Gathering", an event that lives in the ROOT community space. The
-- owner's rule: "Space calendars should only show events, features and
-- programs offered by that space."
--
-- WHAT WENT WRONG. 20270122000000 (ADR-898) added FOUR membership axes to
-- fix an empty coaching calendar. Two of them key on the Space's OWNER
-- rather than on the Space:
--
--   3. e.host_id = the Space's owner        <- removed here
--   4. an ACCEPTED event_cohosts row for
--      that owner                            <- removed here
--
-- A PERSON IS NOT A SPACE. Owning a Space does not make everything you
-- personally host that Space's programming, and the moment one person owns
-- several Spaces the rule cross-contaminates all of them: the same event
-- appears on every Space that person owns, none of which offered it.
--
-- MEASURED ON PRODUCTION before this migration was written:
--
--   axis                          rows contributed beyond tenancy
--   ----------------------------  -------------------------------
--   host_space_id (branch 2)      0
--   host_id = owner  (branch 3)   11, ALL of them wrong
--   owner's cohosts  (branch 4)   0 rows exist at all
--
-- One owner's two personally-hosted events were appearing on all ten of
-- the Spaces they own. The axes produced 0 correct placements and 11
-- incorrect ones. Branch 2 (`host_space_id`) contributed nothing only
-- because tenancy already covered every real case — it is KEPT, because it
-- is the column that lets a Space declare it is hosting, and it is the
-- supported answer for the need branch 3 was reaching for.
--
-- Danny Kenduck Coaching — the Space whose empty calendar motivated
-- ADR-898 — is unaffected: both its events match on TENANCY, and both also
-- carry host_space_id. Its calendar never depended on the owner axes.
-- Verified before shipping: there are ZERO events with no home space
-- hosted by a Space owner, so no calendar goes empty as a result of this.
--
-- MEMBERSHIP IS NOW THREE DECLARATIONS, NEVER AN INFERENCE:
--   1. e.space_id      = the Space  (the event is homed here)
--   2. e.host_space_id = the Space  (the event names this Space as host)
--   3. an ACCEPTED event_space_shares row (the event was shared here and
--      the Space accepted)
--
-- Each is an explicit statement that the event belongs to this Space. None
-- of them is a guess made from someone's identity.
--
-- KNOWN GAP, deliberately not closed here: `host_space_id` is single-valued,
-- so an event cannot declare TWO co-hosting Spaces. `event_cohosts` cannot
-- express it either — it is keyed by PROFILE, so it can only say "this
-- person co-hosts", never "this Space does". Co-hosting between Spaces needs
-- its own join table and its own ADR; inferring it from the owner's identity
-- is what this migration exists to undo.
--
-- The visibility gate is UNCHANGED and still re-applied per row in every
-- branch: published + public/unlisted + non-cancelled, on the event's OWN
-- row, plus the home-space walling. Membership stays necessary, never
-- sufficient. This migration only ever REMOVES rows from the feed.
--
-- DROP first, matching 20270122000000: the body shape changes and 42P13 has
-- bitten this function on prod before (2026-07-26). Grants re-applied below.
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
    -- owner_profile_id is deliberately NOT selected any more: nothing below
    -- may key membership on who owns this Space (ADR-905). Re-adding it is
    -- the first step of reintroducing the bug.
    select s.id
    from   public.spaces s
    where  s.id = _space_id
      and  s.visibility = 'network'
      and  s.status = 'active'
  )

  -- 1) Events that BELONG on this space's calendar: the event is homed here
  --    (tenancy), or it NAMES this space as its host (ADR-905). Two
  --    declarations. No owner-identity branch.
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
    and  e.starts_at >= now() - interval '1 day'

  union

  -- 2) Events ACCEPTED-shared TO this space (EC3) — unchanged from
  --    20270122000000. The share stays necessary-but-not-sufficient: the
  --    event's OWN visibility gate and its HOME space's walling both apply.
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
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800) UNIONed with events accepted-shared to it (EC3). Membership (ADR-905, narrowing ADR-898) is three DECLARATIONS and never an inference: tenancy (space_id), the hosting axis (host_space_id), and accepted shares. The owner-identity axes ADR-898 added (host_id = owner_profile_id, and the owner''s accepted event_cohosts) are REMOVED: a person is not a space, and on production they produced 11 wrong placements and 0 right ones. Never lists circle_only/private/draft/cancelled: the event''s OWN visibility gate is re-applied in EVERY branch, so membership is necessary but never sufficient. The TARGET space must be network+active (in-function walling), and every event''s HOME space must be network+active too (tenancy-local and platform rows excepted). Carries recurrence_type/recurrence_until/parent_event_id so the .ics route collapses a series to one RRULE VEVENT + EXDATE (EC4, ADR-807). Anon-callable, self-gated in-function.';
