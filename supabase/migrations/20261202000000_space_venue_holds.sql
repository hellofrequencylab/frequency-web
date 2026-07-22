-- Shared venue coordination: space_venue_holds (Collaborator spaces B3, ADR-799 §B).
--
-- WHAT: an ACCEPTED collaborator (space_collaborations) can ask to use a partner space's venue at a
-- proposed time. This is a REQUEST -> APPROVE coordination HOLD, deliberately NOT a real booking: it does
-- NOT touch the space_bookings conflict/buffer engine (booking.ts), so overlapping holds are ALLOWED and
-- a hold can NEVER double-book or block a real customer booking. It is an advisory coordination record
-- for co-located businesses to plan around each other, shown on the shared collaborator calendar (B3).
--
-- SHAPE (mirrors space_collaborations / event_space_shares): the requester_space asks, the venue_space's
-- owner/admin approves. The ROW is the hold. States pending/accepted/declined/cancelled; accepted is a
-- live hold, cancelled is a terminal teardown (either side), declined is the venue owner saying no.
--
-- THE GATE: a hold may only be created when an ACCEPTED space_collaboration links the two spaces (checked
-- in the app layer, lib/spaces/venue-holds.ts + venue-actions.ts). Losing the collaboration does not
-- auto-cancel existing holds (they are a point-in-time agreement); a new hold cannot be started without one.
--
-- ACCESS MODEL: RLS ENABLED, NO policies -> service-role only (identical to space_collaborations +
-- event_space_shares; listed in scripts/rls-deny-all.txt). Every read/write goes through the admin client
-- behind app-layer authz: create gates on the REQUESTER space's owner/admin + an accepted collaboration;
-- respond (accept/decline) gates on the VENUE space's owner/admin; cancel gates on EITHER side. Untyped
-- handle until types regenerate (ADR-246). Additive + idempotent. Reversible: drop table space_venue_holds.

create table if not exists public.space_venue_holds (
  id                 uuid        primary key default gen_random_uuid(),
  -- The space whose venue is being requested (the APPROVER side, owner/admin approves).
  venue_space_id     uuid        not null references public.spaces(id) on delete cascade,
  -- The accepted-collaborator space asking to use it (the INITIATOR side).
  requester_space_id uuid        not null references public.spaces(id) on delete cascade,
  requested_by       uuid        not null references public.profiles(id),
  title              text        not null,
  -- The proposed window. Stored as timestamptz; the app formats it in the venue's zone for display. This
  -- is a coordination hold, so no conflict check is applied against it or against real bookings.
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             text        not null default 'pending'
                       check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  responded_by       uuid        references public.profiles(id),
  -- A space cannot hold its own venue through this path (it books its own venue directly).
  constraint venue_hold_distinct check (venue_space_id <> requester_space_id),
  -- The window must be a real interval.
  constraint venue_hold_interval check (ends_at > starts_at)
);

-- The venue owner's inbox: holds ON my venue by state (pending to approve, accepted to see).
create index if not exists idx_venue_hold_venue_status
  on public.space_venue_holds (venue_space_id, status);
-- The requester's outbox: holds I have asked for by state.
create index if not exists idx_venue_hold_requester_status
  on public.space_venue_holds (requester_space_id, status);
-- Time-window scan for the shared-calendar read (upcoming accepted holds).
create index if not exists idx_venue_hold_starts_at
  on public.space_venue_holds (starts_at);

alter table public.space_venue_holds enable row level security;
-- No policies by design (see header): access is service-role only, gated in the app layer.

comment on table public.space_venue_holds is
  'Shared venue coordination holds between accepted collaborator spaces (ADR-799 B3). A requester_space asks to use venue_space''s venue at a time; the venue owner/admin approves. Advisory coordination ONLY: never touches the space_bookings conflict engine, so a hold can never double-book or block a real booking. States pending/accepted/declined/cancelled. Service-role only (RLS enabled, no policy); writes via lib/spaces/venue-holds.';
