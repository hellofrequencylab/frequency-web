-- An Event can name the JOURNEY it belongs to — as an ASSOCIATION, never as a placement (ADR-883).
--
-- WHAT AN EVENT ALREADY CARRIES, and why the distinction is the whole design:
--
--   PLACEMENT — `events.scope_id` (uuid NOT NULL) + `events.scope_type` (text NOT NULL). This pair
--   is the event's ONE home, and every reader keys on it: the circle page, the circle rail, the
--   upcoming widget, index-data, the Dispatch audience, `getEventCapabilities` (which is what hands
--   a Circle's host management rights over the event), and the `can_read_event()` /
--   "events: status + visibility-aware read" circle_only disjunct. Live values in production are
--   `public` (scope_id = the sentinel region), `circle`, and one legacy `standalone` importer row.
--
--   ASSOCIATION — `events.space_id` (uuid, nullable). NOT a placement: a Space event is
--   `scope_type = 'public'` PLUS `space_id`. The event still lives in its region; the Space column
--   only says which Space it also belongs to.
--
-- A Journey is the second kind, not the first. A Journey does not become an event's home: a Journey
-- has no region, no membership roll that `can_read_event` could consult, and no calendar of its own
-- that an event would move ONTO and off its Circle. An event that is part of a Journey is still a
-- public event in its region, or still a Circle's event, and it must keep whatever placement it had
-- before the link and after the link is removed. So this is one nullable column beside `space_id`,
-- and NOT a fourth `scope_type` value.
--
-- Making it a scope_type would have been actively unsafe. `scope_type = 'journey'` would take the
-- event out of every circle/region read at once (they all test scope_type), it would push a Journey
-- id into `scope_id`, which several readers resolve against `circles` and `nexus_regions`, and it
-- would have to be taught to `can_read_event`, the events SELECT policy, the calendar-follow views,
-- and the Dispatch audience before the first row could be written. None of that buys anything the
-- association column does not already give.
--
-- THE TABLE IS `journey_plans`, NOT `journeys`. There is no `journeys` table and there never was:
-- 20260604170000 renamed `arc_chains`/`arc_steps`/`arc_progress` to `journey_*`, and the Journey
-- entity a member authors, publishes, and runs is `public.journey_plans` (its author is
-- `journey_plans.author_id`, its owning Space is `journey_plans.space_id`). Verified against
-- production before writing this file.
--
-- ON DELETE SET NULL, deliberately. A Journey is authored by one member (or a Space's editors) and
-- an Event is hosted by another; deleting the Journey must never take somebody else's Event with
-- it. The Event survives, un-linked, exactly where it already lived. CASCADE here would let a
-- Journey author delete events they do not host, which is a destructive authority nothing else in
-- the product grants them. (Contrast `journey_phase_events`, whose rows are pure link records and
-- so cascade from both sides — deleting one of those deletes a link, not an Event.)
--
-- NO POLICY CHANGE. Nothing in the events RLS surface reads this column, and adding it changes no
-- policy's answer:
--   • "events: status + visibility-aware read" and `can_read_event()` branch on status, visibility,
--     host_id, posted_by_profile_id, and the scope pair. `journey_id` appears in none of them, so no
--     event becomes readable, or unreadable, because of a link.
--   • `events_space_visible` / `events_space_writable_*` key on `space_id`, which this column does
--     not touch (the write path below is forbidden from touching it — see lib/events/placement.ts).
--   • `journey_plans` keeps its own RLS (public plans, or your own). A viewer who can read an event
--     can now see a Journey's bare uuid on it, but cannot resolve that uuid to a title, slug, or
--     any other field of a Journey they are not entitled to read. A bare id is not the leak; the
--     join is, and the join is still governed.
--
-- TWO THINGS THIS COLUMN DOES NOT DO, stated here because ADR-883's lesson was that repairing a
-- write path arms whatever read path was only safe while nothing flowed through it:
--   1. It is not proof of endorsement. The app gates attachment on the one Journey authority
--      (`canEditJourney` — author, platform operator, or a manager of the owning Space), but the
--      events UPDATE policy is column-blind, so a host holding their own session token could PATCH
--      `journey_id` directly through PostgREST. That is exactly as true of `space_id` and
--      `host_space_id` today, and is a pre-existing gap in the class, not one this column opens.
--      Any surface that treats the link as a Journey's endorsement of an Event needs a real guard
--      across all three columns first.
--   2. It grants no read. A future "Events in this Journey" strip MUST filter
--      `status = 'published'` and a visibility the viewer is entitled to, or read through the
--      user's client rather than the admin client. Reading linked events with the service-role
--      handle and no filters is precisely the shape of the Channel-widget leak in ADR-883.

alter table public.events
  add column if not exists journey_id uuid references public.journey_plans(id) on delete set null;

-- The only read this column exists for is "the Events of Journey X, in time order", so the index
-- leads with journey_id (which also satisfies the covering-index rule for the new FK) and carries
-- starts_at for the ordering. PARTIAL, because the overwhelming majority of events will never be
-- part of a Journey and there is no query that wants those rows by this column.
create index if not exists events_journey_idx
  on public.events (journey_id, starts_at)
  where journey_id is not null;

comment on column public.events.journey_id is
  $c$ASSOCIATION (not placement): the Journey (journey_plans) this Event belongs to, or NULL. The event's home stays scope_id + scope_type, exactly as with space_id. ON DELETE SET NULL so deleting a Journey never deletes an Event. Written only through journeyLinkPatch, livePlacementPatch's sibling in lib/events/placement.ts; read by nothing in RLS.$c$;
