-- =====================================================================
-- circles_near — geolocation proximity search for the directory.
--
-- Returns REAL circles (is_demo = false) ordered by distance from a point,
-- using the PostGIS `geog` generated column + its GiST index (circles_geog_gix)
-- for an index-assisted nearest-neighbour scan (`<->`). Demo circles are hard-
-- excluded so location search only ever surfaces real groups (per product ask).
--
-- Called server-side via the admin client, so RLS is bypassed and the public
-- circle fields are returned directly. distance_m is metres (great-circle on the
-- spheroid); the UI converts to mi/km. Only forming/active circles are listed.
-- =====================================================================

create or replace function circles_near(
  _lat   double precision,
  _lng   double precision,
  _limit integer default 24
)
returns table (
  id            uuid,
  name          text,
  slug          text,
  about         text,
  type          text,
  member_count  integer,
  member_cap    integer,
  status        text,
  neighborhood  text,
  city          text,
  image_url     text,
  latitude      numeric,
  longitude     numeric,
  distance_m    double precision
)
language sql stable
set search_path = public
as $$
  select c.id, c.name, c.slug, c.about, c.type::text,
         c.member_count, c.member_cap, c.status::text,
         c.neighborhood, c.city, c.image_url,
         c.latitude, c.longitude,
         st_distance(c.geog, st_setsrid(st_makepoint(_lng, _lat), 4326)::geography) as distance_m
  from circles c
  where c.is_demo = false
    and c.status in ('forming', 'active')
    and c.geog is not null
  order by c.geog <-> st_setsrid(st_makepoint(_lng, _lat), 4326)::geography
  limit greatest(1, least(coalesce(_limit, 24), 100));
$$;

grant execute on function circles_near(double precision, double precision, integer) to authenticated, anon;
