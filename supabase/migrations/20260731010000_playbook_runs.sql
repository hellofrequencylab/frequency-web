-- Resonance Engine Phase 1 (ADR-382 - docs/NEXT-GEN-CRM.md). The `playbook_runs` table: one row per
-- time a playbook is proposed, run, or dismissed against a subject. It is the AUDIT trail + the input
-- to the Phase 3 circuit-breaker (a playbook whose dismiss-rate spikes auto-pauses). It also captures
-- the training signal: a dismissal ("Not now") is a run with outcome 'dismissed', written back so the
-- next night's ranking learns.
--
-- ACCESS MODEL (mirrors client_notes / space_email / contact_interactions / playbooks): RLS ENABLED,
-- NO client policies. Service-role only behind the gated server actions. Owner/Space scoped via the
-- columns the calling action stamps; the server is the authority for scope (fail-closed per-Space).
--
-- This migration ALSO extends the contact_interactions.source CHECK to accept 'playbook' (the new
-- InteractionSource in lib/crm/interactions.ts) so a governed playbook touch can record on the one
-- timeline. Additive (the existing values are unchanged) + idempotent.
--
-- House style: additive + idempotent (safe to re-run); applied via the Supabase SQL editor; reached
-- untyped until lib/database.types.ts is regenerated (ADR-246). No em or en dashes in any copy here.

create table if not exists public.playbook_runs (
  id              uuid primary key default gen_random_uuid(),
  -- The playbook slug from the code registry (lib/playbooks/registry.ts). Text, not an FK, so a run is
  -- recorded even before the playbooks rows are seeded (v1 reads the code registry).
  playbook_id     text not null,
  -- WHO the run is about, polymorphic across the stitched identity tables (ADR-130), exactly like
  -- contact_interactions: a contact, a private capture, or a member. No single FK by design.
  subject_kind    text not null check (subject_kind in ('contact', 'network_contact', 'profile')),
  subject_id      uuid not null,
  -- The operator who ran/dismissed it (the action's authorized caller).
  actor_profile_id uuid references public.profiles(id) on delete set null,
  -- Run lifecycle. 'proposed' (surfaced on Today) -> 'done' (the operator ran it) | 'dismissed'
  -- ("Not now", the training signal) | 'failed'. Fail-closed default 'proposed'.
  status          text not null default 'proposed'
                    check (status in ('proposed', 'done', 'dismissed', 'failed')),
  -- Free-form outcome detail (e.g. which tool ran, why it was dismissed). Optional.
  outcome         text,
  -- Optional per-Space scope. NULL = the platform timeline.
  space_id        uuid references public.spaces(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

-- Per-playbook history (the circuit-breaker scan: dismiss-rate over a window).
create index if not exists playbook_runs_playbook_idx on public.playbook_runs (playbook_id, started_at desc);
-- Per-subject history (a person's playbook trail).
create index if not exists playbook_runs_subject_idx on public.playbook_runs (subject_kind, subject_id, started_at desc);
-- Per-Space history.
create index if not exists playbook_runs_space_idx on public.playbook_runs (space_id, started_at desc) where space_id is not null;

comment on table public.playbook_runs is
  'Resonance Engine playbook run log (ADR-382). One row per playbook proposed/run/dismissed against a subject. Audit trail + circuit-breaker input (Phase 3) + the training signal (a dismissal is outcome dismissed, written back so the ranking learns). Service-role only behind gated server actions; RLS enabled, no client policies.';
comment on column public.playbook_runs.status is
  'proposed (surfaced on Today) -> done (ran) | dismissed (Not now, the training signal) | failed.';

alter table public.playbook_runs enable row level security;
-- NO policies: all access is service-role via the gated server actions (the client_notes / space_email
-- pattern). RLS enabled with no policy denies all direct client access.

-- ── Extend contact_interactions.source to accept 'playbook' (ADR-382) ───────────────────────────
-- The governed playbook tools record their touch on the one CRM timeline with source 'playbook'
-- (lib/ai/vera/execute.ts). Drop + re-add the CHECK with the new value. Additive (all prior values
-- kept) + idempotent.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_interactions'::regclass
      and contype = 'c'
      and conname = 'contact_interactions_source_check'
  ) then
    alter table public.contact_interactions drop constraint contact_interactions_source_check;
  end if;
end $$;

alter table public.contact_interactions
  add constraint contact_interactions_source_check
  check (source in ('manual', 'engagement', 'resend', 'twilio', 'crm_activity', 'ai', 'playbook', 'system'));

-- Rollback: drop table public.playbook_runs;  and restore the prior source CHECK (without 'playbook').
