-- Add a third Space visibility value: 'unlisted'.
--
-- Semantics: 'unlisted' is reachable by direct link (resolves for any viewer, like 'network'), but is
-- EXCLUDED from the Business Spaces directory and from search-engine indexing. At the DB / RLS layer it
-- behaves like 'network' (publicly readable) rather than 'private' — the existing RLS policies gate on
-- "visibility is distinct from 'private'", so an unlisted Space is already anon-readable with no policy
-- change. The only DB change needed is widening the CHECK constraint that previously pinned the column to
-- ('network','private') (20260711000000_spaces_visibility_plan_entitlements.sql).

alter table public.spaces drop constraint if exists spaces_visibility_check;

alter table public.spaces
  add constraint spaces_visibility_check
  check (visibility in ('network', 'private', 'unlisted'));
