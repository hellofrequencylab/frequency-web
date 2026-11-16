-- SCAN-1226: a paged reader for the public circles list, so the sitemap can walk past 200.
--
-- public.public_circles(_limit) ends `LIMIT GREATEST(1, LEAST(_limit, 200))` and takes no offset, so
-- app/sitemap.ts could only ever advertise the 200 circles with the most members; the rest dropped out of the
-- sitemap with a log line and nothing else. This adds a SECOND function beside it.
--
-- WHY A NEW FUNCTION AND NOT A SECOND ARGUMENT. Adding `_offset` to public_circles would either change its
-- signature (a drop and re-create that every caller of the one-argument form races) or leave two overloads that
-- PostgREST cannot choose between for a call that names only `_limit`. public_circles(integer) is therefore left
-- exactly as it is, for every caller it has, and this file does not touch it.
--
-- WHAT IT IS. The SAME projection and the SAME visibility predicate as public_circles (status forming or active,
-- not unlisted; 20270227000000 explains why the list keys on that axis alone), the same 200-row ceiling per call,
-- plus an offset. The order adds `c.id` as a last tiebreak so two pages cannot disagree about rows that share a
-- member count and a creation instant. SECURITY DEFINER with a pinned search_path, as its sibling is.
--
-- The app reads page one through public_circles and only calls this when that page comes back full
-- (lib/discover.ts walkPublicCirclesPast), so the app is correct both before and after this file is applied.
--
-- Additive and idempotent. ROLLBACK: drop function public.public_circles_page(integer, integer);

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.public_circles_page(_limit integer default 200, _offset integer default 0)
returns table (
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
language sql stable security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.about, c.type::text, c.member_count,
         c.status::text, c.city, tc.name, tc.slug
  from   circles c
  left join topical_channels tc on tc.id = c.topical_channel_id
  where  c.status in ('forming', 'active')
    and  not c.unlisted
  order by c.member_count desc, c.created_at asc, c.id asc
  limit  greatest(1, least(coalesce(_limit, 200), 200))
  offset greatest(0, least(coalesce(_offset, 0), 100000));
$$;

comment on function public.public_circles_page(integer, integer) is
  'The public circles list, a page at a time (SCAN-1226). Same rows and columns as public_circles (forming or active, not unlisted), at most 200 per call, from _offset (0 to 100000), ordered by member_count desc, created_at, id. Read by the sitemap walk in lib/discover.ts once public_circles returns a full page.';

-- Public by intent, like public_circles: revoked by name first (ADR-959), then granted to the roles that read it.
revoke execute on function public.public_circles_page(integer, integer) from public, anon, authenticated;
grant execute on function public.public_circles_page(integer, integer) to anon, authenticated, service_role;

commit;
