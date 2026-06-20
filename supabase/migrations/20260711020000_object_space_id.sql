-- Ownership FKs on the core objects — EXPAND step (Phase 0, ENTITY-SPACES-BUILD Epic 0.3 /
-- ENTITY-SPACES-SYSTEM §4.3 + §4.12). This makes the core objects able to BELONG TO A SPACE:
-- circles, events, practices, journeys (journey_plans), and programs each gain a `space_id`
-- ownership column so a Space can own its own circles/events/practices/journeys/programs.
--
-- This is the REVERSIBLE EXPAND half only (the §4.12 expand → migrate → contract approach):
--   1. add a NULLABLE space_id column (FK -> spaces) so NOTHING existing breaks;
--   2. BACKFILL every existing row to the ROOT space (all pre-existing single-tenant data
--      belongs to the Frequency app itself, which is the seeded root space) — so the canary
--      holds: existing reads, which carry no space_id, implicitly mean the root space and
--      resolve EXACTLY as today;
--   3. add a leading-column composite index with `space_id` first (the Supabase RLS-performance
--      rule: index space_id as the LEADING column of composite indexes).
-- Authorship is UNCHANGED: `host_id` (circles/events) and `created_by`/`author_id`
-- (practices/journey_plans/programs) stay as the authorship/audit axis; `space_id` is the
-- new TENANCY axis. We drop nothing.
--
-- The CONTRACT half (space_id NOT NULL, RLS policies, final composite indexes, cross-tenant
-- leak tests) lands in a SEPARATE follow-up migration per table, once dual-write + backfill are
-- confirmed in prod. RLS is deliberately NOT added here so existing reads keep behaving exactly
-- as today (other agents own the capability resolver + the contract-step RLS).
--
-- App-side, the CREATE paths stamp space_id (defaulting to the root space via loadRootSpaceId)
-- and the new listForSpace() read helpers filter by space_id; space_id is reached with untyped
-- casts until lib/database.types.ts is regenerated (the codebase pattern for not-yet-typed
-- columns, ADR-246).
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the
-- repo's migration-history baseline predates `db push` being safe here — docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; readers/writers cast + are fail-safe until
-- then. This file is the canonical record. SAFE to re-run.
--
-- APPLY ORDER: this single grouped file is self-contained and depends only on the spaces table
-- (20260619000000_spaces_tenancy.sql, already applied) — it FKs each object's space_id ->
-- spaces(id). It is independent of the sibling Phase 0 migrations
-- (20260711000000_spaces_visibility_plan_entitlements.sql, 20260711010000_space_members.sql) but
-- is timestamped AFTER them so the apply order reads top-to-bottom: spaces columns -> space_members
-- -> object ownership FKs. Apply it once; re-running is a no-op.

-- The root space id, resolved once. The legacy single-tenant data is the Frequency app itself,
-- which is the seeded root space (type = 'root', exactly one — 20260619000000_spaces_tenancy.sql).

-- ── circles ──────────────────────────────────────────────────────────────────────────────
alter table public.circles
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.circles.space_id is
  'The Space this circle belongs to (tenancy axis, Phase 0 / ENTITY-SPACES §4.3). Backfilled to the root space for the legacy single-tenant rows; host_id stays the authorship axis. The contract migration sets it NOT NULL + adds RLS. on delete cascade: a Space''s circles die with the Space.';

update public.circles c
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where c.space_id is null;

-- Leading-column index: space-scoped reads filter by space_id first, then order by created_at.
create index if not exists circles_space_created_idx
  on public.circles (space_id, created_at desc);

-- ── events ───────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.events.space_id is
  'The Space this event belongs to (tenancy axis, Phase 0 / ENTITY-SPACES §4.3). Backfilled to the root space for the legacy single-tenant rows; host_id stays the authorship axis. The contract migration sets it NOT NULL + adds RLS. on delete cascade: a Space''s events die with the Space.';

update public.events e
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where e.space_id is null;

-- Leading-column index: space-scoped reads filter by space_id first, then order by starts_at.
create index if not exists events_space_starts_idx
  on public.events (space_id, starts_at desc);

-- ── practices ────────────────────────────────────────────────────────────────────────────
alter table public.practices
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.practices.space_id is
  'The Space this practice belongs to (tenancy axis, Phase 0 / ENTITY-SPACES §4.3). Backfilled to the root space for the legacy single-tenant rows; created_by stays the authorship axis. The contract migration sets it NOT NULL + adds RLS. on delete cascade: a Space''s practices die with the Space.';

update public.practices p
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where p.space_id is null;

-- Leading-column index: space-scoped reads filter by space_id first, then order by created_at.
create index if not exists practices_space_created_idx
  on public.practices (space_id, created_at desc);

-- ── journey_plans (the "journeys" table) ─────────────────────────────────────────────────
-- "Journeys" in the product are the journey_plans rows (lib/journey-plans.ts). There is no
-- separate `journeys` table; journey_plans is the adopted-content table to space-stamp.
alter table public.journey_plans
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.journey_plans.space_id is
  'The Space this journey (journey_plan) belongs to (tenancy axis, Phase 0 / ENTITY-SPACES §4.3). Backfilled to the root space for the legacy single-tenant rows; author_id stays the authorship axis. The contract migration sets it NOT NULL + adds RLS. on delete cascade: a Space''s journeys die with the Space.';

update public.journey_plans jp
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where jp.space_id is null;

-- Leading-column index: space-scoped reads filter by space_id first, then order by created_at.
create index if not exists journey_plans_space_created_idx
  on public.journey_plans (space_id, created_at desc);

-- ── programs (the member-creatable community-library programs table) ─────────────────────
-- The DB `programs` table (20260605120000_community_library.sql) is the member-creatable,
-- approvable type; the 4 file-based operator playbooks (content/programs/*.md) are unaffected.
alter table public.programs
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.programs.space_id is
  'The Space this program belongs to (tenancy axis, Phase 0 / ENTITY-SPACES §4.3). Backfilled to the root space for the legacy single-tenant rows; author_id stays the authorship axis. The contract migration sets it NOT NULL + adds RLS. on delete cascade: a Space''s programs die with the Space.';

update public.programs pr
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where pr.space_id is null;

-- Leading-column index: space-scoped reads filter by space_id first, then order by created_at.
create index if not exists programs_space_created_idx
  on public.programs (space_id, created_at desc);
