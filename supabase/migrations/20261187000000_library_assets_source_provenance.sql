-- Loom provenance: make `library_assets.source` authoritative, so "My uploads" shows only what a
-- member GENUINELY uploaded — not seeded/imported business photos, AI-generated art, or the images
-- that came along when they CLAIMED a found event.
--
-- Background: the Loom "My uploads" scope queries `created_by = <member>` (lib/loom/picker-actions.ts
-- → lib/library/store.ts listLoomScopeImages). Several non-upload paths also stamp `created_by` to a
-- real member (the business importer's seed images, the event-claim copy, and the lossy
-- 20261181000000 created_by backfill), so seeded/claimed content leaked into personal uploads.
--
-- The `source` column has existed since 20260919000000 but was never written. This migration:
--   1. Backfills `source` for POSITIVELY-IDENTIFIED non-upload rows (seed images + AI-generated).
--      Genuine uploads (and anything ambiguous) stay NULL and remain visible — the app treats
--      `source IN ('upload') OR source IS NULL` as "a real upload" (heuristic-reclassify, not
--      hide-unknowns), so nothing a member actually uploaded disappears.
--   2. Adds a documented CHECK so every forward write uses one vocabulary.
-- Forward-fix: the interactive upload paths now stamp `source='upload'`; the seed/claim/AI paths stamp
-- their own provenance (lib/library/store.ts insertSpaceLibraryImage + callers).

-- 1a) AI-generated ("Elements"): Recraft/Vera stamp config.source + a 'generated' tag. Map to the
--     concrete generator when known, else the generic 'generated'. (These carry created_by=null today,
--     so they never sat in "My uploads" anyway — stamped here only to make `source` authoritative.)
update public.library_assets
set source = case
  when config->>'source' in ('recraft', 'vera') then config->>'source'
  else 'generated'
end
where source is null
  and ((config ? 'source') or (tags @> array['generated']::text[]));

-- 1b) Business-importer SEED images. fileSeedImagesIntoLoom (lib/importer/materialize.ts) files every
--     seeded photo with title 'Seed image N' and slug 'seed-…' — a precise, code-guaranteed signature.
--     These are the rows the 20261181000000 backfill re-attributed to the space OWNER, i.e. the exact
--     content the member is complaining about seeing in their personal uploads.
update public.library_assets
set source = 'seed'
where source is null
  and kind = 'image'
  and (title like 'Seed image %' or slug like 'seed-%');

-- Note: legacy EVENT-CLAIM images (event-drafts.ts copyEventImagesToLoom) share the 'event-media'
-- bucket + a real created_by with GENUINE event uploads and carry no retroactive marker, so we do NOT
-- reclassify them here (that would risk hiding real uploads). Going forward the claim path stamps
-- source='event-claim' and genuine event uploads stamp source='upload', so new rows separate cleanly.

-- 2) One provenance vocabulary. NULL stays allowed (legacy genuine uploads + anything ambiguous, all
--    treated as real uploads by the app). Idempotent: dropped-if-exists before add.
alter table public.library_assets drop constraint if exists library_assets_source_check;
alter table public.library_assets add constraint library_assets_source_check
  check (source is null or source in ('upload', 'seed', 'import', 'event-claim', 'recraft', 'vera', 'generated', 'curated'));

comment on column public.library_assets.source is
  'Provenance of the asset (Loom): upload (a member genuinely uploaded it) | seed | import (business importer) | event-claim (came with a claimed event) | recraft | vera | generated (AI) | curated (admin-added shared asset). NULL = legacy/ambiguous, treated as a real upload. "My uploads" shows source IN (upload) OR source IS NULL.';
