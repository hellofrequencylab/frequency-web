-- Library media: accept the formats phones actually shoot (the Loom + business-seeder upload bug).
--
-- The library-media bucket (20260919000000_library_assets.sql) allowed only
-- jpeg/png/gif/webp/avif (+ svg/json for icons & elements), so an iPhone camera-roll
-- photo (image/heic / image/heif) passed the client's loose image/* check and was then
-- rejected by Storage with a 400 "mime type image/heic is not supported" — surfacing as
-- "my photo uploader isn't working" in BOTH the universal Loom picker
-- (lib/loom/picker-actions.ts) and the business-seeder image stager
-- (app/(main)/admin/business-seeder/actions.ts), which both upload here.
--
-- This is the exact bug 20261105000000_event_media_mime.sql already fixed for the
-- event-media bucket; that migration's comment claimed it "mirrors the library-media
-- bucket," but library-media never actually carried heic/heif. Storage enforces the
-- allowlist for service-role uploads too, so widening it here is the real (and only) fix.
-- The svg+xml and application/json entries are preserved: the Loom stores sanitized SVG
-- icons and JSON element/token assets in this bucket, and dropping them would break those.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/heic', 'image/heif',
  'image/svg+xml', 'application/json'
]
where id = 'library-media';
