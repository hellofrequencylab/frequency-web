-- =============================================================================
-- Event gallery (multi-image) — host-curated photos beyond the single cover.
--
-- One additive column so any event can carry MORE than one image. The existing
-- `cover_image_path` (20260625050000) stays the poster / main hero; this array
-- holds the additional gallery images. On the event page the poster is rendered
-- as the hero AND as the first clickable item in the gallery, followed by these.
--
--   • gallery_image_paths text[] — ordered storage paths (in the existing public
--                                  `event-media` bucket, see 20260613100000) of the
--                                  extra gallery images. Stored as paths, not URLs,
--                                  mirroring events.cover_image_path / poster_path;
--                                  resolved to public URLs via getPublicUrl at render.
--                                  Default '{}' = no gallery (current behaviour).
--
-- No behaviour change for existing rows: defaults to the empty array, so every
-- event keeps its single cover until a host adds more.
-- =============================================================================

alter table public.events
  add column if not exists gallery_image_paths text[] not null default '{}'::text[];

comment on column public.events.gallery_image_paths is
  'Ordered storage paths (event-media bucket) of the event''s additional gallery images, beyond cover_image_path. Paths, not URLs (mirrors cover_image_path / poster_path); resolved via getPublicUrl at render. Default {} = no gallery.';
