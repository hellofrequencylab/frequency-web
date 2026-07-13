-- Booking ladder P3 (ADR-605, docs/BOOKING-PLAN.md §P3): RESCHEDULE / CANCEL + BOOKING QUESTIONS.
-- Member self-serve lifecycle plus the intake questions an owner can ask at booking. Confirmation and
-- reminder emails ride the existing email/outbox spine (lib/email.ts + lib/queue/outbox.ts, a new
-- booking_reminder handler); no schema is needed for those (the outbox is generic).
--
-- ACCESS MODEL unchanged: RLS stays enabled with NO client policies; all reads + writes go through the
-- gated server actions in lib/spaces/booking.ts (service-role admin client).
--
-- House style: additive + idempotent. Code is FAIL-SOFT when these columns are absent, so the app runs
-- correctly with this migration UNAPPLIED. SAFE to re-run.

-- ── space_bookings lifecycle columns ────────────────────────────────────────────────────────────
alter table public.space_bookings
  -- The service this booking is for (P1's space_service_types). Stored so a reschedule carries the
  -- service forward and the owner calendar can name it. Null = a legacy flat booking. set null on delete.
  add column if not exists service_type_id uuid references public.space_service_types(id) on delete set null,
  -- The booking this one replaced, when a member reschedules (atomic cancel-old + book-new). Self-FK,
  -- set null if the old row is ever removed (rows are kept for history, so normally it persists).
  add column if not exists rescheduled_from uuid references public.space_bookings(id) on delete set null,
  -- When the booking was cancelled (null while confirmed). Kept alongside status for history + audit.
  add column if not exists cancelled_at timestamptz,
  -- An optional member/owner-supplied reason captured at cancel time (member-facing copy, no PII rules).
  add column if not exists cancel_reason text,
  -- The member's answers to the service's booking questions, captured at booking time (P3). Stored as
  -- an ordered LABELED array [{ id, label, value }] so the owner reads them on the calendar list
  -- without re-resolving the service. Owner reads them on the calendar list.
  add column if not exists answers jsonb;

comment on column public.space_bookings.rescheduled_from is
  'The prior booking this one replaced on a reschedule (atomic cancel-old + book-new). (ADR-605 P3).';
comment on column public.space_bookings.answers is
  'The member''s answers to the service booking questions, keyed by question id. (ADR-605 P3).';

create index if not exists space_bookings_rescheduled_from_idx
  on public.space_bookings (rescheduled_from) where rescheduled_from is not null;

-- ── space_service_types.questions: an ordered intake questionnaire ──────────────────────────────
-- An ordered list of { id, label, type, required } asked when a member books this service. `type` is a
-- plain input kind ('short' | 'long'); the member's answers land in space_bookings.answers.
alter table public.space_service_types
  add column if not exists questions jsonb not null default '[]'::jsonb;

comment on column public.space_service_types.questions is
  'Ordered booking questions [{ id, label, type, required }] asked at booking; answers land in space_bookings.answers. (ADR-605 P3).';
