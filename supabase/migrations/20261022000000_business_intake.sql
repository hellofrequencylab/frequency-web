-- ============================================================================
-- BUSINESS INTAKE: the draft-first staging record for the Smart Business Importer
-- (docs/BUSINESS-IMPORTER.md §3, ADR-569). Promoted from the P0 design draft
-- (DRAFT_business_intake.sql.txt) into a REAL migration for P1 (the research +
-- verification pipeline). NOTHING touches a live Space until an operator approves and
-- Apply materializes the row's draft (docs §5).
-- ============================================================================
--
-- ONE table, service-role only:
--   business_intake - one row per import (operator seeder OR owner wizard), all content
--   in jsonb: the inputs, the harvested raw sources (the harvest CACHE), the extracted +
--   reframed BusinessProfile draft, and the per-field provenance/confidence LEDGER.
--
-- ACCESS MODEL (mirrors space_drip_enrollments / space_automation_rules): SERVICE-ROLE
-- ONLY. RLS is ENABLED with NO client policies, so the ONLY access path is the gated
-- server code (lib/importer/*, service-role admin client). An intake row can hold
-- UN-VERIFIED third-party facts about a business that has not opted in, so it must never
-- be world- or member-readable. Enabling RLS with no policy denies ALL direct client
-- access; the deliberate service-role-only posture is recorded in scripts/rls-deny-all.txt.
--
-- House style (matches space_drip_enrollments.sql): additive + idempotent, applied to
-- production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately
-- and the seam reaches this table with untyped casts until then (ADR-246). SAFE to re-run.
-- No em or en dashes in any copy here.

create table if not exists public.business_intake (
  id              uuid primary key default gen_random_uuid(),

  -- The operator or owner who started this import (getMyProfileId at intake).
  created_by      uuid not null references public.profiles(id) on delete cascade,

  -- Which front door produced this row. 'operator' = the Seeder (heavy-assist, demo default).
  -- 'owner' = the Vera-led Owner Wizard (first-party, owner's own Space). Free-text (no enum) so
  -- a new mode needs no type change; the code gates writes to this known set.
  mode            text not null default 'operator',

  -- The pipeline status machine (docs §3.5): intake -> researching -> review -> applied, with
  -- failed as a recoverable side-state. Free-text, code-gated to the known set.
  status          text not null default 'intake',

  -- IntakeInputs (docs §3.2): websiteUrl, socialHandles (handles only, never credentials),
  -- pastedContent, hints, consent { isDemo, ownerConfirmed }.
  inputs          jsonb not null default '{}'::jsonb,

  -- HarvestedSource[] (docs §3.3): the raw crawl / search / oembed / paste payloads. Doubles as
  -- the harvest CACHE so a re-run of Extract/Verify/Reframe costs no new crawl.
  raw_sources     jsonb not null default '[]'::jsonb,

  -- BusinessProfile (docs §3.4): the extracted + reframed draft the materializer consumes.
  draft           jsonb not null default '{}'::jsonb,

  -- ProvenanceLedger (docs §3.6): Record<fieldPath, LedgerEntry[]> where each entry carries
  -- { sourceUrl, snippet, confidence, kind: fact|inferred|generated, verifiedBy }. This is the
  -- spine of the verification gate: commercial facts never auto-publish without a cited,
  -- verified entry.
  ledger          jsonb not null default '{}'::jsonb,

  -- Running USD spend for THIS import (the per-import cost cap, docs §6.2 / §9e). The pipeline
  -- fails the import to 'review' with partial results rather than spending past the cap.
  budget_spent    numeric not null default 0,

  -- The materialized Space. NULL until Apply provisions (or an operator picks) it. Apply is keyed
  -- by this id for idempotency + edit-wins re-runs (docs §5).
  target_space_id uuid references public.spaces(id) on delete set null,

  applied_at      timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Hot reads: the operator review board lists rows by status, newest first.
create index if not exists business_intake_status_idx
  on public.business_intake (status, created_at desc);

-- Reverse lookup: from a materialized Space back to its intake (re-run / provenance audit).
create index if not exists business_intake_target_space_idx
  on public.business_intake (target_space_id);

-- FAIL-CLOSED: RLS enabled, NO policies. Only the gated server code (service-role admin client)
-- may touch this table. Direct client access (anon or authed) is denied on every row.
alter table public.business_intake enable row level security;

comment on table public.business_intake is
  'The draft-first staging record for the Smart Business Importer (ADR-569). One row per imported business, holding inputs + harvested raw_sources + the extracted/reframed draft + a per-field provenance ledger, so nothing touches a live Space until Apply. Service-role only, fail-closed: RLS ENABLED with NO policies, the only access path is the gated server code in lib/importer/* (admin client). Can hold un-verified third-party facts, so never exposed to clients.';
