-- Vera autonomous-send decision log (ADR — Vera autonomous-send graduation + circuit breaker).
--
-- One row per autonomous-send DECISION: what Vera decided, why, and the exact gate outcome (the
-- circuit-breaker reason + the send-gate reason) plus the final outcome (sent / proposed / blocked).
-- This is the audit trail the circuit breaker writes on every decision. It is a SERVICE-ROLE-ONLY
-- table: reachable only via the admin client behind operator authz, never by anon/authenticated —
-- so it ships with RLS ENABLED and NO POLICY (deny-all / fail-closed), registered in
-- scripts/rls-deny-all.txt.
--
-- Additive + defaults-safe: nothing reads or requires this table until an owner turns autonomy on;
-- the audit writer is best-effort and falls back to agent_actions when this table is absent, so the
-- send path works before this migration is applied.

create table if not exists public.vera_autonomy_decisions (
  id                     uuid        primary key default gen_random_uuid(),
  -- The autonomy category (which send-capable tool): 'playbook_email' | 'intro_email'.
  category               text        not null,
  recipient_profile_id   uuid,
  recipient_email        text,
  -- The final outcome of the graduation path: 'sent' | 'proposed' | 'blocked'.
  outcome                text        not null,
  -- The circuit-breaker decision reason (ok / autonomy_off / breaker_tripped / category_off /
  -- anomaly_trip / platform_cap / recipient_cap / config_error).
  breaker_reason         text,
  -- The send-gate decision reason (ok / suppressed / no_consent / pref_off / frequency_cap / ...).
  gate_reason            text,
  -- Why Vera decided to send (carried from the proposal).
  rationale              text,
  metadata               jsonb       not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

comment on table public.vera_autonomy_decisions is
  'Per-decision audit for Vera autonomous email sends (circuit breaker + send-gate outcome). Service-role only.';

-- Newest-first reads for the owner audit view.
create index if not exists vera_autonomy_decisions_created_at_idx
  on public.vera_autonomy_decisions (created_at desc);

-- Per-recipient / per-category lookups.
create index if not exists vera_autonomy_decisions_category_idx
  on public.vera_autonomy_decisions (category, created_at desc);

-- Deny-all: RLS on, no policy. Only the service-role client (which bypasses RLS) may touch it.
alter table public.vera_autonomy_decisions enable row level security;
