-- Loom provenance, round 2: legacy EVENT-MEDIA images that sit in a member's personal Loom ONLY because
-- they came with an event (seeded demo events, or any pre-provenance event content) are NOT genuine
-- personal uploads, so they must not surface in the Loom "My uploads" scope.
--
-- The first provenance migration (20261187000000) deliberately left the `event-media` bucket alone, to
-- avoid hiding a real event photo a member had uploaded. That risk is now gone: post-provenance every
-- forward path stamps its own `source` --
--   * genuine event uploads     -> 'upload'      (lib/library/event-loom.ts  fileEventImageIntoOwnLoom)
--   * images copied on an event claim -> 'event-claim' (lib/events/event-drafts.ts copyEventImagesToLoom)
-- so ANY event-media row STILL at `source IS NULL` is, by construction, LEGACY (pre-provenance) content.
--
-- Such a row is space-bound event content (a real, non-root `space_id`): it belongs to the event / space,
-- not to the member's personal library. Stamp it 'event-claim' -- the provenance for "an image that
-- reached a Loom by coming with an event" -- so the personal scope (`source IN ('upload') OR source IS
-- NULL`, lib/library/store.ts listLoomScopeImages) stops surfacing it, while the SPACE scope (`space_id`,
-- no source filter) keeps showing it to the space that owns it. Genuine personal uploads (no space, or the
-- library-media bucket) are untouched and stay visible. Idempotent: only rewrites NULLs.
update public.library_assets
set source = 'event-claim'
where source is null
  and storage_bucket = 'event-media'
  and space_id in (select id from public.spaces where type <> 'root');
