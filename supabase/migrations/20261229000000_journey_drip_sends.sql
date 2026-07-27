-- JOURNEY DRIP SENDS: the phase-unlock delivery LEDGER (ADR-840, Journeys lane J3).
--
-- *** DRAFT — NOT YET APPLIED. Do not run against production until the owner approves; the ***
-- *** runner (lib/journeys/drip-sends.ts) is DORMANT until this table exists (it fails safe ***
-- *** to zero deliveries on the missing table), so shipping the code first is harmless.    ***
--
-- Journeys already DERIVE phase unlocks (lib/journeys/schedule.ts, ADR-252: started_at +
-- drip_interval_days), so unlike space_drip_enrollments there is no cursor to advance. What was
-- missing is DELIVERY: nobody told an enrollee a new phase opened. This table is the ledger the
-- journey-drips cron writes: ONE row per enrollment x phase delivery attempt.
--
-- IDEMPOTENCY (mirrors the space-drips claim, ADR-561, with the claim moved into the ledger):
-- the UNIQUE (enrollment_id, phase_index) makes the INSERT itself the claim. A cron pass inserts
-- the row with status 'sending' + claimed_at using ignore-duplicates; Postgres serializes
-- concurrent passes, so exactly one gets its row back, sends the notice, then stamps status
-- 'sent' + sent_at. The loser inserts nothing and moves on. Two overlapping cron runs can never
-- double-send the same phase notice.
--
-- CATCH-UP RULE: a late enrollee may owe several phases at once; the runner notifies only the
-- NEWEST due phase and records the older ones here as 'skipped', so nothing is re-scanned and
-- nobody gets a stack of stale notices.
--
-- ACCESS MODEL (mirrors space_drip_enrollments): SERVICE-ROLE ONLY — RLS ENABLED with NO client
-- policies, so the only access path is the gated server code (lib/journeys/drip-sends.ts,
-- service-role admin client). scripts/rls-deny-all.txt records the deliberate posture.
--
-- House style: additive + idempotent; lib/database.types.ts is regenerated separately and the
-- code reaches this table through ONE narrow untyped accessor until then (ADR-246). SAFE to
-- re-run. No em or en dashes in any copy here.

create table if not exists public.journey_drip_sends (
  id             uuid primary key default gen_random_uuid(),
  -- The enrollment this delivery belongs to. CASCADE: a removed enrollment drops its ledger rows.
  enrollment_id  uuid not null references public.journey_enrollments(id) on delete cascade,
  -- Denormalized from the enrollment at claim time so operator reads never need the join.
  plan_id        uuid not null references public.journey_plans(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  -- The 0-based phase index this row delivers (phase 0 opens at enrollment and is never sent).
  phase_index    integer not null check (phase_index >= 1),
  -- 'sending' = a transient CLAIM a cron pass holds while it delivers. 'sent' = delivered.
  -- 'skipped' = recorded by the catch-up rule without a notice. 'failed' = the notification
  -- write failed after a won claim (visible for an operator retry: delete the row to retry).
  -- Free-text (no enum) so a new state needs no type change; the code gates writes to this set.
  status         text not null default 'sending',
  claimed_at     timestamptz not null default now(),
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.journey_drip_sends is
  'Journey phase-unlock delivery ledger (ADR-840): one row per enrollment x phase attempt. The UNIQUE (enrollment_id, phase_index) is the idempotency claim (insert-with-ignore-duplicates, mirroring the space-drips claim model). Service-role only: RLS ENABLED with NO policies; the only access path is lib/journeys/drip-sends.ts.';
comment on column public.journey_drip_sends.phase_index is
  '0-based phase index in the plan''s ordered phase blocks; phase 0 opens at enrollment and never gets a row.';
comment on column public.journey_drip_sends.status is
  'sending (transient claim) / sent / skipped (catch-up rule) / failed (won claim, notify write failed).';

-- THE claim: one delivery row per enrollment x phase, ever.
create unique index if not exists journey_drip_sends_enrollment_phase_key
  on public.journey_drip_sends (enrollment_id, phase_index);

-- The runner's ledger read: all recorded phases for a batch of enrollments.
create index if not exists journey_drip_sends_enrollment_idx
  on public.journey_drip_sends (enrollment_id);

-- Operator visibility per Journey (a launch surface stat can count deliveries cheaply).
create index if not exists journey_drip_sends_plan_idx
  on public.journey_drip_sends (plan_id, status);

alter table public.journey_drip_sends enable row level security;
