-- library-files: the Loom's private bucket for fonts and documents (LIVE-692).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- 20260925000100 opened the 'font' lane and left its storage for "a later slice": no bucket could
-- hold a font file, and nothing could hold a document. This is that slice, on the pattern of the
-- Loom's other private bucket (library-private, 20270345009550, LIVE-577):
--
--   * PRIVATE (public = false) and SERVED SIGNED. A row in this bucket carries no url; the Studio
--     and the download door mint a short-lived signed URL through the admin client
--     (signedLibraryAssetUrl in lib/library/asset-urls.ts). A font licence usually forbids a public
--     download link, and a document is often an internal one.
--   * STORAGE POLICIES: DELIBERATELY NONE, as for library-private. storage.objects has RLS on, so
--     with no policy naming this bucket anon and authenticated can neither list, read, write nor
--     delete in it. Every write is the Studio upload (uploadLibraryImage in
--     app/(main)/admin/library/actions.ts) behind its gate, through the service role.
--   * 25 MB, and a closed MIME allowlist kept in lockstep with lib/library/upload-kinds.ts: the
--     web font formats, and PDF, plain text, Markdown, CSV and Word documents.
--
-- It also opens the 'document' lane: library_assets.kind gains 'document' beside 'font'. The
-- constraint is the one 20261150000000 left (the Airwaves widening), redeclared with one value more.
--
-- Additive and idempotent. ROLLBACK (only once no library_assets row has
-- storage_bucket = 'library-files'): delete from storage.buckets where id = 'library-files'; and
-- redeclare the kind constraint without 'document'.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-files',
  'library-files',
  false,
  26214400, -- 25 MB
  array[
    'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'font/collection',
    'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf', 'application/vnd.ms-opentype',
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The 'document' lane. Re-add carries the FULL live set (read from production on 2026-10-06) so the
-- constraint stays self-contained, as every prior widener did.
alter table public.library_assets
  drop constraint if exists library_assets_kind_check;

alter table public.library_assets
  add constraint library_assets_kind_check
    check (kind in (
      'image', 'icon', 'element', 'template', 'flow', 'theme', 'app_asset',
      'app', 'font', 'token', 'copy', 'sequence',
      'audio', 'video',
      -- LIVE-692: a document file (PDF, text, Word), stored in library-files like a font
      'document'
    ));

comment on constraint library_assets_kind_check on public.library_assets is
  'Loom asset kinds. Original: image|icon|element|template|flow|theme|app_asset. '
  'Widened by 20260925000000 (app|font|token|copy), 20261010000001 (sequence), 20261150000000 '
  '(audio|video) and 20270346001700 (document, LIVE-692). Font and document files live in the '
  'private library-files bucket and are served signed.';
