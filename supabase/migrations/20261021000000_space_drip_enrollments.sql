-- PER-SPACE DRIP ENROLLMENTS: the RUNNER's enrollment ledger (ADR-561 follow-up to the automation
-- SURFACE, 20261020000000_space_automation.sql). The surface let a Space owner DEFINE rules + drip
-- sequences; nothing yet enrolled a contact or fired a step. This table is the missing state: one row
-- per (contact enrolled into a sequence), tracking WHICH step is next and WHEN it is due.
--
-- ONE table, Space-scoped:
--   space_drip_enrollments — a contact's live position in a Space drip sequence.
--
-- The Space analog of nurture_enrollments (lib/nurture/*). Enrolling a contact = insert one row at the
-- sequence's first step, with next_run_at = now() + that step's delay. The FIRE cron
-- (lib/spaces/drip-runner.ts + /api/cron/space-drips) finds due rows (status 'enrolled' AND
-- next_run_at <= now()), sends the current step through the Space send seam (all anti-spam gates +
-- consent), then advances current_step / next_run_at, marking 'done' at the end.
--
-- IDEMPOTENCY (the whole point of the runner): the cron CLAIMS a due row with a conditional update
-- ('enrolled' -> 'sending', re-asserting status='enrolled' in the WHERE) so two overlapping cron runs
-- never double-send the same step. Postgres serializes the two updates; exactly one wins the claim.
--
-- ACCESS MODEL (mirrors space_automation_rules / space_drip_sequences / space_drip_steps): SERVICE-ROLE
-- ONLY — RLS is ENABLED with NO client policies, so the ONLY access path is the gated server code
-- (lib/spaces/drip-enroll.ts + drip-runner.ts, service-role admin client, space_id-scoped on every read
-- and write). Enabling RLS with no policy denies ALL direct client access. A cross-space contract test
-- (test/contract/tenancy-entity-modules.test.ts) locks the space_id binding so a refactor that drops it
-- fails CI, and scripts/rls-deny-all.txt records the deliberate service-role-only posture.
--
-- House style (matches space_automation.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor; lib/database.types.ts is regenerated separately and the seam reaches this table
-- with untyped casts until then (ADR-246). This file is the canonical record. SAFE to re-run. No em or
-- en dashes in any copy here.

create table if not exists public.space_drip_enrollments (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  sequence_id   uuid not null references public.space_drip_sequences(id) on delete cascade,
  -- The Space contact this enrollment drips to. References the shared contacts table (the audience unit
  -- resolveAudience emits, lib/spaces/audiences.ts). ON DELETE CASCADE: a deleted contact drops its
  -- enrollment (no orphaned sends).
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  -- The email to send to, denormalized at enroll time (a contact's email is stable; keeping it here
  -- means the cron never needs to re-read the contact just to address the send).
  email         text not null,
  -- The step this enrollment is CURRENTLY positioned on (its step_order in space_drip_steps). The cron
  -- sends the first enabled step at-or-after this cursor, then advances it. Starts at the sequence's
  -- first step order.
  current_step  integer not null default 1,
  -- When the current step is DUE. Enroll stamps now() + step0.delay_hours; each send advances it by the
  -- next step's delay. The cron's due predicate is `status='enrolled' AND next_run_at <= now()`.
  next_run_at   timestamptz not null,
  -- 'enrolled' = live, awaiting its next due step. 'sending' = a transient CLAIM a cron run holds while
  -- it sends the current step (idempotency: only one run flips enrolled -> sending). 'done' = every step
  -- sent. 'stopped' = cancelled (contact unsubscribed / consent revoked / sequence disabled+removed).
  -- Free-text (no enum) so a new state needs no type change; the code gates writes to this known set.
  status        text not null default 'enrolled',
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.space_drip_enrollments is
  'The per-Space drip RUNNER ledger (ADR-561): one row per contact enrolled in a Space drip sequence, tracking the current step + when it is next due. space_id-scoped, fail-closed: RLS ENABLED with NO policies, so the ONLY access path is the gated server code in lib/spaces/drip-enroll.ts + drip-runner.ts (service-role admin client). Never exposed cross-space.';
comment on column public.space_drip_enrollments.space_id is
  'The Space that owns this enrollment. Every read/write filters space_id, so an enrollment is never visible to another Space.';
comment on column public.space_drip_enrollments.status is
  'enrolled | sending (transient cron claim) | done | stopped. Free-text so a new state needs no migration; the runner gates writes to this set.';
comment on column public.space_drip_enrollments.current_step is
  'The step_order (space_drip_steps) this enrollment is positioned on. The cron sends the first enabled step at-or-after this, then advances.';

-- One enrollment per (sequence, contact): re-enrolling the same contact into the same sequence is a
-- no-op (the enroll path upserts with ignoreDuplicates on this constraint), so a re-fired trigger never
-- double-enrolls. Mirrors nurture_enrollments' unique (sequence_id, contact_id).
create unique index if not exists space_drip_enrollments_seq_contact_uidx
  on public.space_drip_enrollments (sequence_id, contact_id);

-- The cron hot path: due enrollments (status + next_run_at). Partial on the two live statuses the cron
-- touches so it stays small (a 'done'/'stopped' row is never scanned).
create index if not exists space_drip_enrollments_due_idx
  on public.space_drip_enrollments (status, next_run_at)
  where status in ('enrolled', 'sending');

-- Space-scoped listing (the operator's "who's enrolled" read), newest first.
create index if not exists space_drip_enrollments_space_created_idx
  on public.space_drip_enrollments (space_id, created_at desc);

-- Shared updated_at trigger (public.set_updated_at) — same as the rest of the schema.
drop trigger if exists space_drip_enrollments_set_updated_at on public.space_drip_enrollments;
create trigger space_drip_enrollments_set_updated_at
  before update on public.space_drip_enrollments
  for each row execute function public.set_updated_at();

-- RLS: enabled, NO client policies (all access via the service-role admin client). Exactly like
-- space_drip_sequences / space_automation_rules: enabling RLS with no policy denies ALL direct client
-- access, so the only path is the gated server code (space_id-scoped). Recorded in
-- scripts/rls-deny-all.txt as a deliberate service-role-only table.
alter table public.space_drip_enrollments enable row level security;

-- Rollback:
--   drop table public.space_drip_enrollments;
