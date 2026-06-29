-- Tighten public storage buckets: remove anonymous bucket-wide listing
-- (advisory: public_bucket_allows_listing) for `avatars`, `event-media`, `posts`.
--
-- THE ADVISORY: each of these three buckets has a broad SELECT policy on
-- storage.objects granted TO public with `USING (bucket_id = '<bucket>')`. A
-- bucket-wide SELECT grant is what powers the storage list() API: with it, any
-- anonymous client can ENUMERATE every object name in the bucket (a directory
-- listing of every member's avatar path, every post image, every recap photo).
-- That enumeration is the flagged security risk.
--
-- WHY DROPPING IT IS SAFE (public read-by-URL is preserved):
-- All three buckets are created with public = true (see 20240113000000,
-- 20240116000000, 20260613100000). For a PUBLIC bucket, Supabase serves every
-- object over the public CDN URL (getPublicUrl / /storage/v1/object/public/...)
-- WITHOUT consulting any storage.objects SELECT RLS policy. The bucket's public
-- flag alone authorizes read-by-URL. The broad SELECT policy adds nothing to
-- URL serving; its ONLY extra effect is to enable anonymous list() enumeration.
-- So removing it stops enumeration while every <img src="...public-url..."> keeps
-- working exactly as before.
--
-- WHY IT CANNOT BREAK THE APP:
-- A repo-wide audit (app/, lib/, components/, edge functions) found the app reads
-- these buckets ONLY via getPublicUrl() and writes via upload(); there is NO
-- .list() call against avatars, event-media, or posts. Every `.from('posts')`
-- in code is the public.posts DATABASE table, not the storage bucket. The
-- owner-scoped INSERT/UPDATE/DELETE policies (split_part(name,'/',1) =
-- auth.uid()) are untouched, so uploads and replacements continue to work.
--
-- Idempotent: drop-if-exists only. We intentionally do NOT recreate a SELECT
-- policy; if a future feature needs to enumerate a bucket, do it server-side
-- with the service role, or add a narrowly owner-scoped SELECT policy then.
--
-- Applied separately via Supabase MCP. This file does not touch the live DB.

-- avatars: drop the broad anon/public bucket-wide SELECT (kills list() enumeration).
drop policy if exists "avatars: public read" on storage.objects;

-- event-media: same.
drop policy if exists "event-media: public read" on storage.objects;

-- posts: same.
drop policy if exists "posts: public read" on storage.objects;
