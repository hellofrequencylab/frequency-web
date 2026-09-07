-- LIVE-182 — A PUBLIC CIRCLE'S URL IS ITS SLUG, NOT ITS UUID.
--
-- app/sitemap.ts advertised /discover/circles/<uuid>, and the detail page keyed its canonical,
-- its openGraph.url, its hero lookup and its breadcrumb on circle.id. The slug was ALREADY IN
-- HAND the whole time: circles.slug is NOT NULL, public_circle_by_id has returned it since
-- 20270227000000, and PublicCircle carries it — every one of those pages read it and threw it
-- away. A UUID carries no keyword signal, cannot be quoted in an AI answer, and is the string a
-- citation, a printed QR code and a share link all freeze permanently.
--
-- This is the exact defect LIVE-052 closed for practices; Circles were not carried along. Three
-- public Circles exist today, which is precisely why it is cheap now and expensive once indexed.
--
-- ⚠️ A SIBLING, NOT A WIDENING. public_circle_by_id is left EXACTLY as it is: its signature is
-- pinned by the browser-execute revoke ledger (20270304000000) and a direct UUID link must keep
-- resolving so the 308 the page issues has something to redirect FROM. This mirrors the shape the
-- codebase already uses for the same problem one entity over — public_event_by_slug beside
-- public_event_by_id — rather than inventing a third.
--
-- 🔴 THE VISIBILITY CONTRACT IS COPIED VERBATIM FROM public_circle_by_id AND MUST STAY THAT WAY.
-- Same status filter, same private.can_see_circle(...) predicate, same SECURITY DEFINER and the
-- same search_path. A by-slug lookup that is one clause laxer than the by-id lookup is a
-- privacy hole with a friendlier URL: it would let anyone enumerate a fully-hidden circle by
-- guessing its name. The two bodies differ in the lookup column and nothing else.

CREATE OR REPLACE FUNCTION public.public_circle_by_slug(_slug text)
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
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  FROM   circles c
  LEFT JOIN topical_channels tc ON tc.id = c.topical_channel_id
  WHERE  c.slug = _slug
    AND  c.status IN ('forming', 'active')
    AND  private.can_see_circle(c.id, c.unlisted, c.access, c.space_id, c.host_id)
  LIMIT  1;
$$;

-- Read from the browser by anon and authenticated alike, exactly as its by-id twin is: this is the
-- public detail read behind /discover/circles/<slug>, and the redaction lives in the body above.
GRANT EXECUTE ON FUNCTION public.public_circle_by_slug(text) TO anon, authenticated;

COMMENT ON FUNCTION public.public_circle_by_slug(text) IS
  'LIVE-182: the public Circle detail read keyed on the slug. Body is verbatim public_circle_by_id '
  'apart from the lookup column - the visibility predicate must never diverge from its twin.';
