-- space_booking: 1:1 BOOKING for the Practitioner role (ENTITY-SPACES-SYSTEM §2.4 "1:1 booking
-- with availability, buffers, time-zones, no-show policy"). This is the v1 of that deep feature:
-- an owner publishes weekly availability windows, a member books an open slot, the owner sees their
-- upcoming bookings. Two service-role tables, scoped by space_id, isolated per Space.
--
-- DEFERRED to a later phase (NOT modeled here): calendar sync, buffers beyond the plain window math
-- (slot_minutes), a no-show policy, payments/packages, and per-MEMBER timezone conversion. v1 keeps
-- ONE IANA timezone per Space (space_availability.timezone), and the member surface displays slots
-- in that labeled timezone. A buffers / no-show / per-member-tz expansion is additive (a column +
-- a blueprint), never a refactor (P4).
--
-- ACCESS MODEL (mirrors space_members, 20260711010000): RLS is enabled TO authenticated with NO
-- client read/write policies at all. EVERY read + write goes through the gated server actions in
-- lib/spaces/booking.ts using the service-role admin client (which bypasses RLS). The server is the
-- authority for "which space" and "what may this caller do here" (P5):
--   • setSpaceAvailability / listSpaceBookings are gated on canEditProfile (owner / admin / editor).
--   • listOpenSlots returns only OPEN slot instants (never who booked) to any authenticated member.
--   • createBooking re-validates the slot server-side (still open + within availability) before it
--     inserts; the partial unique index below is the last-line guard against a double-book race.
--   • cancelBooking is allowed for the booker or a space admin.
--
-- House style (matches space_members.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor; lib/database.types.ts is regenerated separately, and lib/spaces/booking.ts
-- reaches these tables with untyped casts until then (the codebase pattern for not-yet-typed
-- tables, ADR-246). This file is the canonical record. SAFE to re-run.

-- ── space_availability: the weekly windows an owner publishes ─────────────────────────────────
-- One or more recurring weekly windows per Space, expressed in the Space's local IANA `timezone`.
-- weekday 0 = Sunday … 6 = Saturday. start_minute / end_minute are minutes from LOCAL midnight in
-- that timezone (so 9:00am = 540, 5:00pm = 1020). slot_minutes is the length each window is sliced
-- into (a window 540..1020 at 30 = sixteen 30-minute slots). The slot generator in
-- lib/spaces/booking.ts is the single source of truth for turning these windows + booked times into
-- concrete open instants; this table only stores the recurring rule.
create table if not exists public.space_availability (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),     -- 0 = Sunday … 6 = Saturday
  start_minute  smallint not null check (start_minute between 0 and 1439),   -- minutes from local midnight
  end_minute    smallint not null check (end_minute between 1 and 1440),     -- exclusive end, after start
  slot_minutes  smallint not null default 30 check (slot_minutes between 5 and 480),
  timezone      text not null default 'UTC',                           -- the Space's IANA tz, one per Space
  created_at    timestamptz not null default now(),
  check (end_minute > start_minute)
);

comment on table public.space_availability is
  'Weekly 1:1 availability windows for a Space (ENTITY-SPACES-SYSTEM §2.4, booking v1). weekday 0=Sunday..6=Saturday; start_minute/end_minute are minutes from LOCAL midnight in `timezone` (an IANA name, one per Space); slot_minutes is the slice length. The slot generator in lib/spaces/booking.ts turns these rules + booked times into concrete open instants. Writes are service-role only via setSpaceAvailability (gated on canEditProfile).';

comment on column public.space_availability.weekday is '0 = Sunday, 6 = Saturday (matches JS Date.getUTCDay in the Space timezone).';
comment on column public.space_availability.start_minute is 'Window start as minutes from local midnight in `timezone` (e.g. 540 = 9:00am).';
comment on column public.space_availability.end_minute is 'Window end (exclusive) as minutes from local midnight; must be greater than start_minute.';
comment on column public.space_availability.slot_minutes is 'Length each window is sliced into, in minutes (5..480). Buffers beyond this are a later phase.';
comment on column public.space_availability.timezone is 'The IANA timezone the window minutes are local to (one timezone per Space in v1). Per-member tz conversion is deferred.';

-- The tenant filter: every read of this table filters space_id first.
create index if not exists space_availability_space_idx on public.space_availability (space_id);

-- ── space_bookings: a member's confirmed (or cancelled) 1:1 slot ──────────────────────────────
-- starts_at / ends_at are absolute UTC instants (the slot generator computes them from a window in
-- the Space timezone). status 'confirmed' holds the slot; 'cancelled' releases it (kept for history
-- rather than deleted). The partial UNIQUE index below enforces ONE confirmed booking per
-- (space_id, starts_at): two members racing for the same open slot, the second insert fails on the
-- constraint and createBooking returns a friendly "just taken" message. A cancelled row does NOT
-- occupy the slot, so a released time can be re-booked.
create table if not exists public.space_bookings (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  member_profile_id  uuid not null references public.profiles(id),
  starts_at          timestamptz not null,                              -- absolute UTC instant
  ends_at            timestamptz not null,                              -- starts_at + slot_minutes
  status             text not null default 'confirmed'
                       check (status in ('confirmed', 'cancelled')),
  note               text,
  created_at         timestamptz not null default now()
);

comment on table public.space_bookings is
  'Member 1:1 bookings against a Space (ENTITY-SPACES-SYSTEM §2.4, booking v1). starts_at/ends_at are absolute UTC instants; status confirmed holds the slot, cancelled releases it (kept for history). A partial unique index on (space_id, starts_at) WHERE status=confirmed prevents double-booking. Writes are service-role only via createBooking/cancelBooking in lib/spaces/booking.ts.';

comment on column public.space_bookings.starts_at is 'Slot start as an absolute UTC instant (computed from a window in the Space timezone).';
comment on column public.space_bookings.ends_at is 'Slot end (starts_at + the window slot_minutes), absolute UTC.';
comment on column public.space_bookings.status is 'confirmed = the slot is held; cancelled = released (row retained for history, does not block re-booking).';

-- The leading-column index for the tenant filter + the upcoming-bookings sort (space_id, starts_at).
create index if not exists space_bookings_space_starts_idx on public.space_bookings (space_id, starts_at);
-- "Which bookings does this member hold" (cancelBooking ownership + a member's own list later).
create index if not exists space_bookings_member_idx on public.space_bookings (member_profile_id);

-- DOUBLE-BOOK GUARD: at most one CONFIRMED booking per (space_id, starts_at). A cancelled row is
-- excluded from the index, so cancelling a slot frees it to be booked again. This is the DB-level
-- last line of defense behind createBooking's server-side re-check (it closes the read-then-insert
-- race two members hitting the same open slot would otherwise lose to).
create unique index if not exists space_bookings_one_confirmed_per_slot
  on public.space_bookings (space_id, starts_at)
  where status = 'confirmed';

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ───────────
-- Exactly like space_members: enabling RLS with no SELECT/INSERT/UPDATE/DELETE policy denies all
-- direct client access, so the only path to these rows is the gated server actions in
-- lib/spaces/booking.ts (the admin client bypasses RLS). This keeps "who booked" off the client and
-- the slot re-validation server-authoritative.
alter table public.space_availability enable row level security;
alter table public.space_bookings enable row level security;
