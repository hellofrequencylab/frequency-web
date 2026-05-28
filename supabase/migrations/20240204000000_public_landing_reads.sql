-- =============================================================================
-- Public landing-page reads + handle ops without service-role bypass.
--
-- Background: app/page.tsx, app/api/check-handle/route.ts, and
-- app/api/search-handles/route.ts currently use createAdminClient() (service
-- role) because the existing RLS policies block anonymous and `member` reads.
-- That's a security smell — service role bypasses RLS entirely, so a bug in
-- the query layer can leak unintended columns.
--
-- This migration narrows the surface:
--   • Row-level public-read on `posts` (visibility=public only, no replies)
--   • Row-level public-read on `events` (non-cancelled, future only)
--   • Three SECURITY DEFINER RPCs that expose specific summaries without
--     opening the full tables to anon:
--       - public_member_count()          → count of active profiles
--       - public_active_circle_count()   → count of forming+active circles
--       - handle_is_available(text)      → boolean uniqueness check
--       - search_handles_public(text)    → narrow profile-search shape
--
-- The RPC approach is preferred over broad anon SELECT on profiles because
-- it lets us choose exactly which columns are returned, regardless of what
-- the caller passes to .select().
-- =============================================================================


-- ---------------------------------------------------------------------------
-- posts: anon can read public, top-level posts
-- ---------------------------------------------------------------------------

CREATE POLICY "posts: public read top-level public posts"
  ON posts FOR SELECT
  TO anon
  USING (
    visibility = 'public'
    AND parent_id IS NULL
  );


-- ---------------------------------------------------------------------------
-- events: anon can read non-cancelled future events
-- ---------------------------------------------------------------------------

CREATE POLICY "events: public read future non-cancelled"
  ON events FOR SELECT
  TO anon
  USING (
    is_cancelled = false
    AND starts_at >= now()
  );


-- ---------------------------------------------------------------------------
-- RPC: public_member_count
-- Returns the number of active profiles. No PII exposed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_member_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM   profiles
  WHERE  is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public_member_count() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- RPC: public_active_circle_count
-- Returns the number of circles currently forming or active.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_active_circle_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM   circles
  WHERE  status IN ('forming', 'active');
$$;

GRANT EXECUTE ON FUNCTION public_active_circle_count() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- RPC: handle_is_available
-- Used by the sign-up flow to check if a handle is free without exposing
-- whose row currently owns it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_is_available(check_handle text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM profiles WHERE handle = check_handle
  );
$$;

GRANT EXECUTE ON FUNCTION handle_is_available(text) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- RPC: search_handles_public
-- Returns the same shape /api/search-handles always returned: id, handle,
-- display_name, avatar_url. No bio, no role, no region.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_handles_public(q text)
RETURNS TABLE (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.handle, p.display_name, p.avatar_url
  FROM   profiles p
  WHERE  p.is_active = true
    AND  (p.handle ILIKE q || '%' OR p.display_name ILIKE q || '%')
  ORDER BY p.display_name
  LIMIT 6;
$$;

GRANT EXECUTE ON FUNCTION search_handles_public(text) TO anon, authenticated;
