-- =============================================================================
-- Public discover events: expose price_cents (BUILD-LIST P3 — `offers` in the
-- Event JSON-LD). Google's Event rich-result guidelines want an `offers` block
-- with a real price; the public RPCs previously exposed no pricing, so the
-- schema hardcoded isAccessibleForFree:true even for ticketed events. Adds
-- price_cents to public_events / public_event_by_slug (NULL = free). Still
-- never selects events.location (the privacy rule for public reads), and the
-- function bodies are otherwise verbatim from 20240211000000_public_discover_reads.
-- RETURNS TABLE changes need DROP + recreate (CREATE OR REPLACE can't alter the
-- return type); EXECUTE grants are re-issued.
-- =============================================================================

DROP FUNCTION IF EXISTS public_events(integer);
CREATE FUNCTION public_events(_limit integer DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text,
  price_cents integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name, e.price_cents
  FROM   events e
  LEFT JOIN circles c
         ON e.scope_type = 'circle' AND e.scope_id = c.id
  WHERE  e.is_cancelled = false
    AND  e.starts_at >= now()
  ORDER BY e.starts_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public_events(integer) TO anon, authenticated;

DROP FUNCTION IF EXISTS public_event_by_slug(text);
CREATE FUNCTION public_event_by_slug(_slug text)
RETURNS TABLE (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text,
  price_cents integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name, e.price_cents
  FROM   events e
  LEFT JOIN circles c
         ON e.scope_type = 'circle' AND e.scope_id = c.id
  WHERE  e.slug = _slug
    AND  e.is_cancelled = false
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public_event_by_slug(text) TO anon, authenticated;
