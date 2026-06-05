-- Per-persona nurture sequences (ADR-131, Entry Points Phase 3).
--
-- When a lead is captured with a persona (lib/onboarding/lead-flows.ts → captureLead),
-- we enroll them in that persona's nurture sequence: an ordered list of timed email
-- steps. A cron (/api/cron/nurture) advances due enrollments, sending each step gated
-- by consent (contacts.consent_state + notification prefs) and stamping a lead
-- unsubscribe link. This closes the "no persona nurture series exists yet" gap noted
-- in (marketing)/start/actions.ts.
--
-- All three tables are service-role only (no client RLS policies), like contacts /
-- automation_rules — access is through the admin client in lib/nurture/*.

-- One sequence per persona (the persona key is unique). Operators toggle it on/off.
create table if not exists public.nurture_sequences (
  id          uuid primary key default gen_random_uuid(),
  persona     text not null unique,
  name        text not null,
  enabled     boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.nurture_sequences is
  'ADR-131 Entry Points Phase 3: one per-persona nurture sequence. Steps in nurture_steps; enrollments in nurture_enrollments. Service-role only.';

-- The ordered steps of a sequence. delay_hours is measured from the PREVIOUS step's
-- send (or from enrollment for the first step), so a sequence reads as "wait N hours,
-- then send this".
create table if not exists public.nurture_steps (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references public.nurture_sequences(id) on delete cascade,
  step_order   integer not null default 1,
  delay_hours  integer not null default 24 check (delay_hours >= 0),
  subject      text not null,
  body         text not null,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists nurture_steps_sequence_idx
  on public.nurture_steps (sequence_id, step_order);

comment on table public.nurture_steps is
  'ADR-131: ordered email steps of a nurture sequence. delay_hours is relative to the prior step (or enrollment for the first).';

-- A contact's progress through a sequence. next_step_order + next_run_at are what the
-- cron polls; status goes active → completed (ran out of steps) or cancelled
-- (unsubscribed / opted out). Unique (sequence_id, contact_id) makes enrollment
-- idempotent — a re-captured lead never double-enrolls.
create table if not exists public.nurture_enrollments (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.nurture_sequences(id) on delete cascade,
  contact_id      uuid not null,
  email           text not null,
  persona         text not null,
  status          text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  next_step_order integer not null default 1,
  next_run_at     timestamptz not null default now(),
  last_sent_at    timestamptz,
  enrolled_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (sequence_id, contact_id)
);

-- The cron's hot path: due active enrollments.
create index if not exists nurture_enrollments_due_idx
  on public.nurture_enrollments (status, next_run_at);

comment on table public.nurture_enrollments is
  'ADR-131: a contact''s progress through a persona nurture sequence. Cron polls (status, next_run_at).';

-- Shared updated_at trigger (public.set_updated_at) — same as the rest of the schema.
create trigger nurture_sequences_set_updated_at
  before update on public.nurture_sequences
  for each row execute function public.set_updated_at();

create trigger nurture_steps_set_updated_at
  before update on public.nurture_steps
  for each row execute function public.set_updated_at();

create trigger nurture_enrollments_set_updated_at
  before update on public.nurture_enrollments
  for each row execute function public.set_updated_at();

alter table public.nurture_sequences   enable row level security;
alter table public.nurture_steps       enable row level security;
alter table public.nurture_enrollments enable row level security;
