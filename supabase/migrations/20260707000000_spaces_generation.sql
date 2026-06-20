-- Per-Space GENERATION (feel) default: the operator's chosen value for the theme
-- GENERATION axis (type scale, density, radius, motion, ornament, tap floor; the
-- "feel" half of a skin; see app/globals.css "GENERATION axis" + lib/theme/generations.ts).
-- The server theme resolver (lib/theme/server/resolve.ts) already accepts a `spaceGeneration`
-- parameter in its precedence chain (member cookie, then Space default, then system default);
-- this migration adds the column that feeds it. NULLABLE: a null value means "no Space default",
-- so the resolver falls through to DEFAULT_GENERATION (today's `balanced` look) and nothing
-- changes for any existing Space until an operator sets one. Additive + idempotent (the spaces
-- table ships in 20260619000000_spaces_tenancy.sql; the skin column already exists there).
--
-- Applied to production via the Supabase SQL Editor (the repo's migration-history baseline
-- predates `db push` being safe here; see docs/WORKFLOW.md). lib/database.types.ts carries the
-- spaces types (hand-added to match this schema; regenerate to refresh canonically). The store
-- reader (lib/spaces/store.ts) and resolve.ts cast the selected value locally until the generated
-- types pick this column up, so the typed reads keep working before this is applied. This file is
-- the canonical record.

alter table public.spaces add column if not exists generation text;

comment on column public.spaces.generation is
  'Optional default for the theme GENERATION (feel) axis for this Space (validated app-side via resolveGeneration before use). NULL = no Space default; the resolver falls back to DEFAULT_GENERATION. The PALETTE still comes from the assigned theme (spaces.skin); generation is feel-only.';
