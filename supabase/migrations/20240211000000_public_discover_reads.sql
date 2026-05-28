-- =============================================================================
-- Public "Discover" reads — column-safe, location-redacted.
--
-- Goal: let anonymous visitors and crawlers browse community content read-only,
-- WITHOUT ever exposing precise location. City/area is the coarsest detail; the
-- exact venue (events.location) and circle coordinates/neighborhood
-- (circles.neighborhood / latitude / longitude) are never returned to anon.
--
-- Principle (continuing 20240204000000_public_landing_reads.sql): never give
-- anon a broad table SELECT. Crawlers read the raw PostgREST API, so redaction
-- must happen at the data layer. SECURITY DEFINER functions let us choose the
-- exact columns returned regardless of what the caller passes to .select().
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Close the existing location leak.
--
-- 20240204000000 added an anon row-level SELECT on `events` that returned the
-- FULL row — including the free-text `location` column — for every future,
-- non-cancelled event. That let anyone read meetup addresses straight from the
-- REST API. Replace it with the column-safe RPCs below.
--
-- Note: the public landing page is the only anon consumer of this policy. The
-- shareable .ics route uses the service-role admin client (RLS-exempt), and all
-- in-app event reads use the `events: crew+ read in scope` policy — none of
-- those are affected.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "events: public read future non-cancelled" ON events;


-- ---------------------------------------------------------------------------
-- 2. public_events — upcoming events, no location.
--    City is derived from the owning Circle (scope_type='circle'); null when
--    the event isn't circle-scoped. events.location is never selected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_events(_limit integer DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name
  FROM   events e
  LEFT JOIN circles c
         ON e.scope_type = 'circle' AND e.scope_id = c.id
  WHERE  e.is_cancelled = false
    AND  e.starts_at >= now()
  ORDER BY e.starts_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public_events(integer) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. public_event_by_slug — single event for a public detail page, no location.
--    Returns non-cancelled events regardless of date so a freshly-passed event
--    page still renders (the page can show "this event has ended").
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_event_by_slug(_slug text)
RETURNS TABLE (
  id          uuid,
  slug        text,
  title       text,
  description text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  city        text,
  circle_id   uuid,
  circle_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name
  FROM   events e
  LEFT JOIN circles c
         ON e.scope_type = 'circle' AND e.scope_id = c.id
  WHERE  e.slug = _slug
    AND  e.is_cancelled = false
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public_event_by_slug(text) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. public_circles — forming/active circles, city only.
--    Never returns neighborhood, latitude, longitude. `about` is the public
--    blurb the host wrote, safe to show.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_circles(_limit integer DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  slug         text,
  name         text,
  about        text,
  type         text,
  member_count integer,
  status       text,
  city         text,
  channel_name text,
  channel_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.status IN ('forming', 'active')
  ORDER BY c.member_count DESC, c.created_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public_circles(integer) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. public_circle_by_id — single circle for a public detail page, city only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_circle_by_id(_id uuid)
RETURNS TABLE (
  id           uuid,
  slug         text,
  name         text,
  about        text,
  type         text,
  member_count integer,
  status       text,
  city         text,
  channel_name text,
  channel_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.id = _id
    AND  c.status IN ('forming', 'active')
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public_circle_by_id(uuid) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. public_posts — public, top-level posts with a SAFE author shape.
--    Anon has no SELECT on `profiles` (that policy is crew+), so the existing
--    landing query's author join silently returns null. This RPC returns only
--    display_name / handle / avatar_url — no bio, role, region, or email.
--    Mirrors the existing "posts: public read top-level public posts" policy
--    (visibility='public', top-level, not hidden).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_posts(_limit integer DEFAULT 20)
RETURNS TABLE (
  id                  uuid,
  body                text,
  created_at          timestamptz,
  media_urls          text[],
  author_display_name text,
  author_handle       text,
  author_avatar_url   text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.body, p.created_at, p.media_urls,
         pr.display_name, pr.handle, pr.avatar_url
  FROM   posts p
  LEFT JOIN profiles pr ON pr.id = p.author_id
  WHERE  p.visibility = 'public'
    AND  p.parent_id IS NULL
    AND  p.hidden_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT  GREATEST(1, LEAST(_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public_posts(integer) TO anon, authenticated;
