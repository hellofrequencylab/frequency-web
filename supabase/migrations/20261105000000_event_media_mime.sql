-- Event media: accept the formats phones actually shoot.
--
-- The event-media bucket (20260613100000_event_posts_media_cohosts.sql) allowed only
-- jpeg/png/gif/webp, so an iPhone camera-roll photo (image/heic / image/heif) or a
-- modern AVIF export passed the client's loose image/* check and was then rejected by
-- Storage with a 400 "mime type ... is not supported" — the "event photo upload fails"
-- bug. Storage enforces the allowlist for service-role uploads too, so widening it
-- here is the real (and only) fix. Mirrors the library-media bucket, which already
-- carries image/avif (20260919000000_library_assets.sql).
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/avif'
]
where id = 'event-media';
