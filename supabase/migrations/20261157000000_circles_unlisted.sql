-- Give circles a visibility switch: `unlisted`.
--
-- Semantics (mirrors the Space `visibility='unlisted'` value, 20261142000000): an unlisted circle is
-- still reachable by direct link (its detail page resolves for anyone, its members keep it in their
-- own lists) but it is EXCLUDED from every discovery surface — the /circles index/map/browse rails,
-- the /discover directory + sitemap, and the public_circles RPC. It is NOT a lifecycle change, so it
-- is orthogonal to `status` (forming/active/inactive/archived/draft): an active circle can be unlisted
-- and still fully live for its members.
--
-- A plain boolean (default false) is used rather than a `visibility` enum: circles have no 'private'
-- concept (draft/archived already cover "hidden"), so a single unlisted flag is the whole surface.

alter table public.circles
  add column if not exists unlisted boolean not null default false;

comment on column public.circles.unlisted is
  'When true the circle is hidden from all discovery (index, map, /discover, sitemap, public_circles RPC) but still resolves by direct link and stays visible to its own members. Orthogonal to status.';

-- Fold the flag into the public discovery RPC so anon/authenticated list reads drop unlisted circles.
-- public_circle_by_id is deliberately left untouched: a direct link to an unlisted circle must resolve.
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
    AND  NOT c.unlisted
  ORDER BY c.member_count DESC, c.created_at ASC
  LIMIT  GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public_circles(integer) TO anon, authenticated;
