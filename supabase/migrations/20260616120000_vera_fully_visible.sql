-- =============================================================================
-- ADR-231 update: Vera is FULLY VISIBLE (owner reversal, 2026-06-11).
--
-- The owner's call after seeing the Community page without her: Vera appears
-- everywhere members browse — the directory card, header search, and the
-- mention/handle autocomplete. This restores search_handles_public to its
-- original 20240204000000 shape (20260616110000 had added `is_system = false`).
-- She stays OFF the leaderboard, people suggestions, and operator assignment
-- lists (app-side filters — she's a voice, not a player), and the admin guards
-- (no sign-in, no delete) are untouched.
-- =============================================================================

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
