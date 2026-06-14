-- =============================================================================
-- RSVP depth (EVENTS-REWORK Track A1) — make maybe / waitlist / plus-ones
-- first-class and add the host-facing depth the Invite needs.
--
-- WHAT EXISTS: 20260609230000 already added event_rsvps.plus_ones (int) and
-- widened status to ('going','not_going','maybe','waitlist'). The capacity trigger
-- 20260610030000 coerces an over-capacity 'going' to 'waitlist'. Both stay intact.
--
-- WHAT THIS ADDS (all additive + nullable/defaulted — existing rows keep their
-- exact current behaviour):
--   • plus_one_names  jsonb   — optional names for the +1s a guest is bringing
--                               (host can require names; app validates count vs
--                               plus_ones). Default '[]'.
--   • decline_reason  text    — host-only-visible reason a guest declined. Only
--                               meaningful when status='not_going'. Existing RLS
--                               (host "sees all for their events") already gates
--                               who can READ an rsvp row, so the reason inherits
--                               host visibility for free — no new policy needed.
--   • approval_status text    — 'none' (default; no approval required, = today),
--                               'pending' (awaiting host approval), 'approved'.
--                               Invited guests are written straight to 'approved'
--                               by the app (Luma: invitees skip the queue).
--   • muted          boolean  — per-event mute, default false. Suppresses Event
--                               Dispatch fan-out to this guest (20260625040000
--                               reads it). Confirmed-add: it did not exist.
--
-- The capacity trigger only inspects status, so none of these columns affect it.
-- =============================================================================

alter table public.event_rsvps
  add column if not exists plus_one_names  jsonb   not null default '[]'::jsonb,
  add column if not exists decline_reason  text,
  add column if not exists approval_status text    not null default 'none',
  add column if not exists muted           boolean not null default false;

-- plus_one_names must be a JSON array (of strings), never an object/scalar.
alter table public.event_rsvps drop constraint if exists event_rsvps_plus_one_names_check;
alter table public.event_rsvps add constraint event_rsvps_plus_one_names_check
  check (jsonb_typeof(plus_one_names) = 'array');

alter table public.event_rsvps drop constraint if exists event_rsvps_approval_status_check;
alter table public.event_rsvps add constraint event_rsvps_approval_status_check
  check (approval_status in ('none', 'pending', 'approved'));

-- Host queue read: pending approvals per event, oldest first.
create index if not exists event_rsvps_pending_approval_idx
  on public.event_rsvps (event_id, created_at)
  where approval_status = 'pending';

comment on column public.event_rsvps.plus_one_names is
  'Optional names of the +1s this guest brings (jsonb array of strings). App enforces length vs plus_ones and whether the host requires names.';
comment on column public.event_rsvps.decline_reason is
  'Host-only-visible reason for a not_going RSVP. Visibility rides the existing event_rsvps SELECT RLS (host sees all rows for their events); never shown to other guests.';
comment on column public.event_rsvps.approval_status is
  'none (default; no approval needed) | pending (awaiting host) | approved. Invited guests are written approved (skip the queue); host approves the rest.';
comment on column public.event_rsvps.muted is
  'Per-event mute. When true, Event Dispatch fan-out (20260625040000) skips this guest. Default false.';
