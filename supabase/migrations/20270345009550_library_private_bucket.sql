-- THE LOOM'S PRIVATE BUCKET (PROG-D6 child 2 · LIVE-577 · ADR-1595, under ADR-1562).
--
-- Both Loom buckets are public = true (library-media, 20260919000000; recordings-media,
-- 20261150000000), so every Loom object is served over /storage/v1/object/public/ and no policy is
-- ever consulted: `is_protected` on library_assets was a word on a row, and the original of a
-- protected asset was one public URL away from anyone who had ever seen it. This file adds the
-- private twin of library-media. The app moves a protected asset's file here
-- (protectLibraryAsset in app/(main)/admin/library/actions.ts) and shows it to the operator through
-- a short-lived signed URL (signedLibraryAssetUrl in lib/library/asset-urls.ts). Nothing public
-- moves: the shared library and every page image stay in library-media.
--
-- SAME LIMITS AS library-media: 20 MB and the image allowlist as 20261190000000 left it
-- (heic/heif included; svg+xml and json kept for icons and element assets). No audio or video:
-- recordings-media has no private twin yet, and the protect action refuses those with a sentence.
--
-- STORAGE POLICIES: DELIBERATELY NONE. storage.objects has RLS on, and with no policy naming
-- `library-private`, anon and authenticated can neither list, read, write nor delete an object in
-- it. Every read and write goes through the service-role admin client behind the Studio's gate,
-- which is the posture the Loom tables had before PROG-D5. This silence is the decision, not an
-- oversight: a per-Space read policy is LIVE-571's shape and arrives when a session client reads
-- the Loom. Every existing storage.objects policy is scoped by bucket_id (avatars, posts,
-- network-contacts, event-media), so none of them reaches this bucket either;
-- supabase/tests/library_private_bucket.test.sql proves both halves after a fresh apply.
--
-- Independent of 20270345009500 (LIVE-570, the Loom TABLE policies): this file touches
-- storage.buckets only, so the two apply in either order.
--
-- EXISTING OBJECTS: this file moves none. An asset already marked Protected under LIVE-576 still
-- has its file in library-media; the protect action compares the flag with the BUCKET, not with
-- the stored flag, so the next Save of that asset's drawer moves it. The rows to visit:
--   select id, title from public.library_assets
--   where is_protected and storage_bucket = 'library-media';
--
-- ORDER: either order with the code is safe. Code first: a protect finds no bucket, the copy
-- fails, and the action refuses with the row unchanged. This file first: nothing reads the bucket
-- until the code does. House rule: APPLY AFTER MERGE (docs/DATABASE.md), execute_sql for this DDL
-- and then the ledger insert at this file's own version.
--
-- ROLLBACK (only once no library_assets row has storage_bucket = 'library-private'; move those
-- back with protectLibraryAsset(id, false) first, or their files go with the bucket):
--   delete from storage.buckets where id = 'library-private';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-private',
  'library-private',
  false,
  20971520, -- 20 MB, the same as library-media
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
    'image/heic', 'image/heif',
    'image/svg+xml', 'application/json'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
