-- PER-SPACE AUTOMATION: trigger -> action rules + ordered drip sequences (R5, business-accounts
-- Automation). The Space-scoped analog of the root automation_rules / nurture_sequences tables.
-- A Space owner (with the `automation` entitlement) can:
--   • define simple rules ("when a contact enters this pipeline stage, send this email"), and
--   • build ordered drip sequences (a named series of timed email steps) over the Space's OWN
--     contacts / segments.
--
-- Three tables, all Space-scoped:
--   space_automation_rules   — one trigger -> action rule (email an audience), enabled/disabled.
--   space_drip_sequences     — a named, ordered drip series (like nurture_sequences but per-Space).
--   space_drip_steps         — the ordered timed steps of a sequence (delay_hours + subject + body).
--
-- ACCESS MODEL (mirrors space_segments / space_email_templates / client_notes): every table stays
-- SERVICE-ROLE ONLY — RLS is ENABLED with NO client policies, so the ONLY access path is the gated
-- server actions in lib/spaces/automation.ts (+ automation-actions.ts), which resolve the Space,
-- gate on canEditProfile, and filter space_id on every read and write. Enabling RLS with no
-- SELECT/INSERT/UPDATE/DELETE policy denies ALL direct client access (a service-role admin client
-- bypasses RLS; a member's client cannot reach these rows at all). Every reader filters space_id
-- FIRST and is fail-safe; a single-row read ALSO filters space_id so a cross-space id leaks nothing.
-- Never exposed cross-space. A cross-space contract test (test/contract/tenancy-entity-modules.test.ts)
-- locks the space_id binding so a refactor that drops it fails CI.
--
-- House style (matches space_segments.sql / space_email.sql): additive + idempotent, applied to
-- production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately and the seam
-- reaches these tables with untyped casts until then (ADR-246). This file is the canonical record.
-- SAFE to re-run. No em or en dashes in any copy here.

-- ── 0. campaigns: carry the scheduled audience + allow a transient 'sending' claim (R4) ──────────
-- The scheduled-send cron (lib/spaces/campaigns-send-due.ts) needs two things the campaigns table did
-- not yet hold:
--   • audience_filter — WHICH of the Space's contacts a SCHEDULED campaign goes to. The interactive
--     composer resolves the audience at send time from the picker; a scheduled campaign has no live
--     picker, so scheduleSpaceCampaign records the chosen AudienceFilter here and the cron resolves
--     from it. jsonb, free-form (AudienceFilter-shaped, lib/spaces/audiences.ts).
--   • a 'sending' status — the cron CLAIMS a due campaign with a conditional update
--     (status 'scheduled' -> 'sending') so two overlapping cron runs never double-send the same
--     campaign: exactly one run flips scheduled -> sending and proceeds; the other sees no due rows.
--     status is a free-text column (no enum/CHECK), so 'sending' needs no type change.
alter table public.campaigns add column if not exists audience_filter jsonb;

comment on column public.campaigns.audience_filter is
  'The AudienceFilter (lib/spaces/audiences.ts) a SCHEDULED Space campaign targets. The scheduled-send cron resolves recipients from this. Null for a draft / an interactive one-off send (which resolves its audience live).';

-- Claim index for the cron hot path: due scheduled campaigns (status + scheduled_for). Partial on the
-- two statuses the cron touches so it stays small.
create index if not exists campaigns_scheduled_due_idx
  on public.campaigns (status, scheduled_for)
  where status in ('scheduled', 'sending');

-- ── Rules: one trigger -> action (email an audience) ─────────────────────────────────────────────
create table if not exists public.space_automation_rules (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  name           text not null,
  -- The event that fires the rule. Free-text (no enum) so adding a trigger needs no migration; the
  -- server validates it against a known list (lib/spaces/automation.ts SPACE_AUTOMATION_TRIGGERS).
  trigger_event  text not null,
  -- The action to take. Free-text for the same reason; today only 'email_audience'.
  action_type    text not null default 'email_audience',
  -- Action payload: an AudienceFilter-shaped audience + the email subject/body (jsonb, free-form so
  -- the action shape can evolve without a migration).
  action_config  jsonb not null default '{}'::jsonb,
  enabled        boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.space_automation_rules is
  'Per-Space trigger -> action automation rules (R5). space_id-scoped, fail-closed: RLS ENABLED with NO policies, so the ONLY access path is the gated server actions in lib/spaces/automation.ts (service-role admin client, canEditProfile). Never exposed cross-space.';
comment on column public.space_automation_rules.space_id is
  'The Space that owns this rule. Every read/write filters space_id, so a rule is never visible to another Space.';
comment on column public.space_automation_rules.action_config is
  'jsonb: { audience: AudienceFilter, subject, body }. Free-form so the action shape can evolve migration-free.';

create index if not exists space_automation_rules_space_created_idx
  on public.space_automation_rules (space_id, created_at desc);

-- ── Drip sequences: a named, ordered email series ────────────────────────────────────────────────
create table if not exists public.space_drip_sequences (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  -- The audience this sequence drips to, when started (AudienceFilter-shaped jsonb).
  audience     jsonb not null default '{}'::jsonb,
  enabled      boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.space_drip_sequences is
  'Per-Space ordered drip sequences (R5). Steps live in space_drip_steps. space_id-scoped, fail-closed (RLS ENABLED, NO policies). Server-only via lib/spaces/automation.ts. Never exposed cross-space.';
comment on column public.space_drip_sequences.audience is
  'An AudienceFilter-shaped object (lib/spaces/audiences.ts): who this sequence drips to when started.';

create index if not exists space_drip_sequences_space_created_idx
  on public.space_drip_sequences (space_id, created_at desc);

-- ── Drip steps: ordered timed steps of a sequence ────────────────────────────────────────────────
-- delay_hours is measured from the PREVIOUS step's send (or from sequence start for the first step),
-- exactly like nurture_steps, so a sequence reads as "wait N hours, then send this".
create table if not exists public.space_drip_steps (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references public.space_drip_sequences(id) on delete cascade,
  -- DENORMALIZED space_id so every step read binds the Space directly (defense in depth: a step is
  -- never reachable except through its Space, even though it also chains through sequence_id).
  space_id     uuid not null references public.spaces(id) on delete cascade,
  step_order   integer not null default 1,
  delay_hours  integer not null default 24 check (delay_hours >= 0),
  subject      text not null,
  body         text not null,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.space_drip_steps is
  'Ordered email steps of a Space drip sequence (R5). delay_hours is relative to the prior step (or sequence start for the first). space_id denormalized for a direct tenancy binding. Fail-closed (RLS ENABLED, NO policies).';

create index if not exists space_drip_steps_sequence_idx
  on public.space_drip_steps (sequence_id, step_order);
create index if not exists space_drip_steps_space_idx
  on public.space_drip_steps (space_id);

-- Shared updated_at trigger (public.set_updated_at) — same as the rest of the schema.
drop trigger if exists space_automation_rules_set_updated_at on public.space_automation_rules;
create trigger space_automation_rules_set_updated_at
  before update on public.space_automation_rules
  for each row execute function public.set_updated_at();

drop trigger if exists space_drip_sequences_set_updated_at on public.space_drip_sequences;
create trigger space_drip_sequences_set_updated_at
  before update on public.space_drip_sequences
  for each row execute function public.set_updated_at();

drop trigger if exists space_drip_steps_set_updated_at on public.space_drip_steps;
create trigger space_drip_steps_set_updated_at
  before update on public.space_drip_steps
  for each row execute function public.set_updated_at();

-- RLS: enabled, NO client policies (all access via the service-role admin client). Exactly like
-- space_segments / space_email_templates: enabling RLS with no policy denies ALL direct client
-- access, so the only path is the gated server actions (canEditProfile, space_id-scoped).
alter table public.space_automation_rules enable row level security;
alter table public.space_drip_sequences   enable row level security;
alter table public.space_drip_steps       enable row level security;

-- Rollback:
--   drop table public.space_drip_steps;
--   drop table public.space_drip_sequences;
--   drop table public.space_automation_rules;
