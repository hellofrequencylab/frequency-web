-- Space-scope the Puck `pages` table (the public, brandable micro-site block tree).
-- EXPAND step (Phase 0.5e, ENTITY-SPACES-BUILD §0.5.13). The `pages` table is the public
-- Puck page-editor store (data = working draft, published_data = the live document the public
-- site renders); see docs/PAGE-EDITOR-SPEC.md + docs/PAGE-FRAMEWORK.md "Two builders" boundary.
-- To make per-Space landing/marketing pages possible later (Phase 5 white-label), every row
-- must know which Space it belongs to. This migration does the additive EXPAND half:
--   1. add a NULLABLE space_id column (FK -> spaces) so nothing existing breaks;
--   2. BACKFILL every existing row to the ROOT space (the current single-tenant marketing pages
--      belong to the Frequency app itself), so the canary holds: root resolves exactly as today;
--   3. add a leading-column composite index (space_id, slug) for the scoped read.
-- Stays NULLABLE (no contract step yet). The Puck editor is still gated to the 4-slug
-- `isEditableSlug` allowlist (lib/page-editor/data.ts); per-Space authoring un-gates in Phase 5.
--
-- App-side, the page-editor store/action fns thread space_id (defaulting to the root space via
-- loadRootSpaceId) and the upserts scope by space_id; space_id is reached with untyped casts
-- until lib/database.types.ts is regenerated (the codebase pattern for not-yet-typed columns,
-- ADR-246).
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the
-- repo's migration-history baseline predates `db push` being safe here, see docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; readers/writers cast + are fail-safe until then.
-- This file is the canonical record. SAFE to re-run.

-- ── 1. Expand: the nullable space_id column ──────────────────────────────────────────────
alter table public.pages
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.pages.space_id is
  'The Space this Puck micro-site page belongs to (per-Space landing/marketing pages, Phase 0.5e). Backfilled to the root space for the legacy single-tenant marketing pages; stays NULLABLE (no contract step yet; per-Space authoring un-gates in Phase 5 white-label). on delete cascade: a Space''s pages die with the Space.';

-- ── 2. Backfill: every existing row -> the ROOT space ────────────────────────────────────
-- The legacy single-tenant pages are the Frequency app itself, which is the seeded root space
-- (type = 'root', exactly one; 20260619000000_spaces_tenancy.sql). Only NULL rows are touched,
-- so re-running is a no-op.
update public.pages p
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where p.space_id is null;

-- ── 3. Leading-column composite index for the scoped read ────────────────────────────────
-- getPage / listPages filter by space_id first, then slug, so space_id leads the index.
create index if not exists pages_space_slug_idx
  on public.pages (space_id, slug);
