-- Per-Space VISIBILITY + PLAN + ENTITLEMENTS (ENTITY-SPACES-BUILD §0, Epic 0.1; ENTITY-SPACES-
-- SYSTEM §3.1 / §4.2). The three columns that turn a `spaces` row into an entitled tenant:
--   * visibility — Networked vs Private. 'network' = listed in cross-network discovery/feed/
--     people-search; 'private' = walled off (the new first-class flag, ADR-249 §1.3). The
--     `network_connected` switch stays separate (gamification/library port-in); visibility is
--     the discovery boundary.
--   * plan — the plan LABEL (free/starter/pro/business/…) the entitlements derive from. A plain
--     text label; no CHECK so a new plan name is never a migration. NULL = no plan set yet.
--   * entitlements — a single jsonb the plan grants ({ "crm": true, "email": true, … }). A new
--     capability is ONE KEY, never a schema migration (P4). DEFAULT-DENY: a missing/false key is
--     "off" (read app-side via spaceHasEntitlement, lib/spaces/entitlements.ts).
--
-- Existing rows: the seeded ROOT space (the Frequency app itself) is backfilled to 'network' so
-- the canary holds — root behaves exactly as today (fully networked). plan/entitlements keep
-- their column defaults (NULL / '{}').
--
-- House style: additive + idempotent, expand-only (nothing is dropped or made NOT NULL here),
-- applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here — see docs/WORKFLOW.md). lib/database.types.ts carries the
-- spaces types (hand-added / regenerated to refresh canonically); the store reader
-- (lib/spaces/store.ts) and lib/spaces/entitlements.ts reach the new columns with untyped casts
-- until the generated types pick them up (the codebase pattern for not-yet-typed columns,
-- ADR-246). This file is the canonical record. SAFE to re-run.

-- ── 1. visibility: Networked vs Private (the discovery boundary) ─────────────────────────
alter table public.spaces
  add column if not exists visibility text not null default 'network'
    check (visibility in ('network', 'private'));

comment on column public.spaces.visibility is
  'Networked vs Private (ENTITY-SPACES-SYSTEM §1.3): network = listed in cross-network discovery/feed/people-search; private = walled off. Separate from network_connected (gamification/library port-in). Backfilled to network for the legacy root space.';

-- ── 2. plan: the plan label the entitlements derive from ─────────────────────────────────
alter table public.spaces
  add column if not exists plan text;

comment on column public.spaces.plan is
  'Plan label (free/starter/pro/business/…) this Space''s entitlements derive from. Plain text (no CHECK — a new plan name is never a migration). NULL = no plan set yet.';

-- ── 3. entitlements: the jsonb the plan grants (default-deny on missing) ─────────────────
alter table public.spaces
  add column if not exists entitlements jsonb not null default '{}'::jsonb;

comment on column public.spaces.entitlements is
  'The capability map the Space''s plan grants ({ "crm": true, … }). One key per capability, never a schema migration (P4). DEFAULT-DENY: a missing/false key is off (read via spaceHasEntitlement, lib/spaces/entitlements.ts).';

-- ── 4. Backfill the seeded ROOT space -> 'network' ───────────────────────────────────────
-- The column default already lands every row (incl. root) on 'network'; this is the explicit,
-- idempotent backfill the spec calls for, so the intent is recorded even if the default ever
-- changes. The root is the canonical Frequency app (type = 'root', exactly one — see
-- 20260619000000_spaces_tenancy.sql) and is fully networked.
update public.spaces
set visibility = 'network'
where type = 'root' and visibility is distinct from 'network';
