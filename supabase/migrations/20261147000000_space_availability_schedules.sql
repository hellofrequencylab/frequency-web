-- Booking ladder P2 (ADR-605, docs/BOOKING-PLAN.md §P2): AVAILABILITY SCHEDULES. Turns the flat weekly
-- window set into a real schedule with the guard-rails members expect: buffers before / after a booking,
-- a minimum scheduling notice, a configurable rolling booking window, date-specific overrides
-- (blackouts + one-off open blocks), and a single named IANA timezone.
--
-- The pure slot generator (lib/spaces/booking.ts) reads these as ADDITIVE options: it subtracts buffers
-- (a slot within buffer_before/after of an existing booking is blocked, WIDENING the conflict check
-- beyond the exact-instant unique index, which stays the final race guard), drops slots inside
-- min_notice_minutes from now, clamps to booking_window_days, and applies overrides. Invitee-timezone
-- display is a client concern (the stored instant stays absolute UTC).
--
-- ACCESS MODEL: mirrors space_availability (20260711050000). RLS enabled with NO client policies; every
-- read + write goes through the gated server actions in lib/spaces/booking.ts (service-role admin
-- client). Writes are gated on canEditProfile.
--
-- House style: additive + idempotent (IF NOT EXISTS throughout). Code is FAIL-SOFT when these tables /
-- the new column are absent, so the app runs correctly with this migration UNAPPLIED (a Space with no
-- schedule row simply uses the defaults: no buffers, no notice, a 14-day window). SAFE to re-run.

-- ── space_availability_schedules: the per-Space scheduling rules ────────────────────────────────
create table if not exists public.space_availability_schedules (
  id                    uuid primary key default gen_random_uuid(),
  space_id              uuid not null references public.spaces(id) on delete cascade,
  name                  text not null default 'Default',
  timezone              text not null default 'UTC',                    -- the single IANA tz for the schedule
  buffer_before_minutes smallint not null default 0 check (buffer_before_minutes between 0 and 480),
  buffer_after_minutes  smallint not null default 0 check (buffer_after_minutes between 0 and 480),
  min_notice_minutes    integer  not null default 0 check (min_notice_minutes between 0 and 43200), -- <= 30 days
  booking_window_days   smallint not null default 14 check (booking_window_days between 1 and 365),
  active                boolean  not null default true,
  created_at            timestamptz not null default now()
);

comment on table public.space_availability_schedules is
  'Per-Space scheduling rules (ADR-605 booking ladder P2): buffers before/after, minimum notice, rolling booking window, and the single IANA timezone. Read as additive options by the pure slot generator. Service-role only via setSpaceSchedule (gated on canEditProfile).';

create index if not exists space_availability_schedules_space_idx
  on public.space_availability_schedules (space_id, active);

-- Group the weekly-hours rows under a schedule (optional; a null schedule_id uses the Space's single
-- active schedule / the defaults). on delete set null keeps windows when a schedule is removed.
alter table public.space_availability
  add column if not exists schedule_id uuid references public.space_availability_schedules(id) on delete set null;

comment on column public.space_availability.schedule_id is
  'Optional group under a space_availability_schedules row (ADR-605 P2). Null = the Space single active schedule / defaults.';

-- ── space_availability_overrides: date-specific hours + days off ────────────────────────────────
create table if not exists public.space_availability_overrides (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.space_availability_schedules(id) on delete cascade,
  on_date       date not null,                                          -- the local calendar date affected
  is_blackout   boolean not null default false,                         -- true = day off (remove all slots)
  start_minute  smallint check (start_minute is null or (start_minute between 0 and 1439)),
  end_minute    smallint check (end_minute is null or (end_minute between 1 and 1440)),
  created_at    timestamptz not null default now(),
  check (is_blackout or (start_minute is not null and end_minute is not null and end_minute > start_minute))
);

comment on table public.space_availability_overrides is
  'Date-specific schedule overrides (ADR-605 booking ladder P2): is_blackout removes a day; otherwise start_minute/end_minute (minutes from local midnight in the schedule tz) replace that day''s regular hours with a one-off open block. Service-role only.';

create index if not exists space_availability_overrides_schedule_idx
  on public.space_availability_overrides (schedule_id, on_date);

-- One override row per (schedule, date): a date is either off or has one replacement block.
create unique index if not exists space_availability_overrides_one_per_date
  on public.space_availability_overrides (schedule_id, on_date);

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ────────────
alter table public.space_availability_schedules enable row level security;
alter table public.space_availability_overrides enable row level security;
