-- Re-key page_settings to (space_id, route) — EXPAND step (Phase 0.5a, ENTITY-SPACES-BUILD
-- §0.5.2 / §B.4). This is the keystone enabler for per-entity layout + SEO: today page_settings
-- is keyed by `route` alone (single-tenant); to give every Space its own page layout/SEO the
-- table must be keyed by (space_id, route). This migration does the REVERSIBLE expand half:
--   1. add a NULLABLE space_id column (FK -> spaces) so nothing existing breaks;
--   2. BACKFILL every existing row to the ROOT space (the current single-tenant data belongs
--      to the Frequency app itself), so the canary holds: root resolves exactly as today;
--   3. add a leading-column composite index (space_id, route) for the scoped cascade read.
-- The CONTRACT half (space_id NOT NULL, the PK swap to the composite, RLS scoped, leak tests)
-- lands in the SEPARATE follow-up migration once dual-write + backfill are confirmed in prod.
--
-- App-side, the store/action fns already thread space_id (defaulting to the root space) and the
-- upserts use onConflict 'space_id,route'; space_id is reached with untyped casts until
-- lib/database.types.ts is regenerated (the codebase pattern for not-yet-typed columns, ADR-246).
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the
-- repo's migration-history baseline predates `db push` being safe here — docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; readers/writers cast + are fail-safe until then.
-- This file is the canonical record. SAFE to re-run.

-- ── 1. Expand: the nullable space_id column ──────────────────────────────────────────────
alter table public.page_settings
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.page_settings.space_id is
  'The Space this page-settings row belongs to (per-entity layout/SEO scope, Phase 0.5a). Backfilled to the root space for the legacy single-tenant rows; the contract migration sets it NOT NULL and makes (space_id, route) the primary key. on delete cascade: a Space''s page settings die with the Space.';

-- ── 2. Backfill: every existing row -> the ROOT space ────────────────────────────────────
-- The legacy single-tenant data is the Frequency app itself, which is the seeded root space
-- (type = 'root', exactly one — 20260619000000_spaces_tenancy.sql). Only NULL rows are touched,
-- so re-running is a no-op.
update public.page_settings ps
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where ps.space_id is null;

-- ── 3. Leading-column composite index for the scoped cascade read ────────────────────────
-- loadLayoutForRoute / loadPageSettings filter by space_id first, then route (or route IN the
-- scope chain), so space_id leads the index.
create index if not exists page_settings_space_route_idx
  on public.page_settings (space_id, route);
