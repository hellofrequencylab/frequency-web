-- =============================================================================
-- Events P0 — capacity, visibility, taxonomy + RSVP waitlist (additive)
--
-- Extends the existing Events system (circle-scoped today) with the core-loop
-- fields the reconciled spec (docs/EVENTS-SYSTEM.md) calls for in P0:
--   • events.capacity      — null = unlimited; the ONLY real scarcity signal
--   • events.visibility    — public | unlisted | circle_only | private
--   • events.category      — library taxonomy (default 'gathering')
--   • events.energy_tag    — nervous-system framing for resonance matching
--   • event_rsvps.plus_ones, status += 'maybe'|'waitlist', reminder_7d_sent_at
--   • circles.resonance_public — gate for the (later) public Circle Field badge
--
-- Purely additive + backward-compatible: existing rows default to the prior
-- behaviour (circle_only, unlimited, no waitlist). RLS is intentionally left
-- unchanged — public/unlisted discovery needs its own RLS pass when standalone
-- events ship (events are circle-scoped today).
-- =============================================================================

-- ── events ──────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists capacity   integer,
  add column if not exists visibility text not null default 'circle_only',
  add column if not exists category   text not null default 'gathering',
  add column if not exists energy_tag text;

alter table public.events drop constraint if exists events_capacity_check;
alter table public.events add constraint events_capacity_check
  check (capacity is null or capacity > 0);

alter table public.events drop constraint if exists events_visibility_check;
alter table public.events add constraint events_visibility_check
  check (visibility in ('public', 'unlisted', 'circle_only', 'private'));

alter table public.events drop constraint if exists events_energy_tag_check;
alter table public.events add constraint events_energy_tag_check
  check (energy_tag is null or energy_tag in ('high_activation', 'grounding', 'social', 'ceremonial'));

comment on column public.events.capacity is
  'Max going RSVPs; null = unlimited. The only real scarcity signal we surface (no fake urgency).';
comment on column public.events.visibility is
  'public | unlisted | circle_only | private. circle_only preserves the pre-P0 model.';

-- ── event_rsvps ───────────────────────────────────────────────────────────────
alter table public.event_rsvps
  add column if not exists plus_ones           integer not null default 0,
  add column if not exists reminder_7d_sent_at timestamptz;

alter table public.event_rsvps drop constraint if exists event_rsvps_plus_ones_check;
alter table public.event_rsvps add constraint event_rsvps_plus_ones_check
  check (plus_ones >= 0);

-- Widen the status domain (was: going | not_going) to add maybe + waitlist.
alter table public.event_rsvps drop constraint if exists event_rsvps_status_check;
alter table public.event_rsvps add constraint event_rsvps_status_check
  check (status in ('going', 'not_going', 'maybe', 'waitlist'));

-- Waitlist promotion reads the oldest waitlisted row per event.
create index if not exists event_rsvps_waitlist_idx
  on public.event_rsvps (event_id, created_at)
  where status = 'waitlist';

-- ── circles ─────────────────────────────────────────────────────────────────
alter table public.circles
  add column if not exists resonance_public boolean not null default false;

comment on column public.circles.resonance_public is
  'Opt-in: when true a circle''s Circle Field / Resonance standing may show publicly. Default private to avoid inter-circle performance dynamics.';
