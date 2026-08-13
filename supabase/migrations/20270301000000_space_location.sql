-- SPACES GET A PLACE ON THE MAP (ADR-1026).
--
-- ── WHY THIS MIGRATION EXISTS ─────────────────────────────────────────────────────────────────
--
-- The Around You map (ADR-1022) shipped with three declared layers: Events, Circles, Spaces. Two of
-- them worked. `spaces` carried NO coordinate of any kind, so the Spaces layer could never draw a
-- single pin, while the map's own empty state told every visitor that "Events, Circles and Spaces
-- show up here once they have a location". Measured 2026-08-13: 20 active Spaces, 0 mappable.
--
-- The nearest thing that existed was a free-text `address` string inside `spaces.preferences`
-- (lib/spaces/profile-data.ts), which drives the Contact card's map LINK. A link is not a pin: it is
-- a string handed to a third party to resolve. Nothing could plot it, sort by it, or search near it,
-- and no Space had set it.
--
-- ── THE PRIVACY SHAPE, WHICH IS AN OWNER SETTING AND NOT A DEFAULT ────────────────────────────
--
-- A Space is not always a storefront. Plenty are run out of somebody's home, and the owner's ruling
-- (2026-08-13) was that the Space itself chooses:
--
--   location_precision = 'exact'        the pin is the coordinate, for a venue that wants footfall
--   location_precision = 'approximate'  the pin is coarsened to a ~1 km grid cell before it is
--                                       published (lib/maps/approximate.ts)
--
-- 🔴 THE COARSENING IS NOT DONE HERE, AND THAT IS DELIBERATE. It would be tempting to store only the
-- fuzzed point and keep the true one out of the table entirely. That breaks the owner's other
-- requirement in the same breath: they asked to be able to ADJUST THE PIN. An owner dragging a pin
-- is editing the true location, so the true location has to survive round trips through the editor.
-- The coarsening therefore happens on the READ path, once, in the loader that publishes the pin, and
-- `location_precision` is the flag that loader obeys. Anything that reads latitude/longitude off
-- this table and publishes it without consulting `location_precision` is a leak;
-- lib/nearby/map-pins.test.ts holds the ratchet.
--
-- DEFAULT 'exact' is correct even though it is the less private value: the columns start NULL, so a
-- Space has no location at all until its owner sets one, and setting one is the act of consenting to
-- it. There is no row this default can surprise.
--
-- ── SHAPE BORROWED FROM `circles`, ON PURPOSE ─────────────────────────────────────────────────
--
-- latitude/longitude numerics plus a STORED GENERATED `geog`, exactly as
-- 20240214000000_enable_postgis_geography.sql did for circles. The generated column can never drift
-- from the pair that feeds it, needs no trigger, and gives the same GiST index the "near me" RPCs
-- already use, so a Spaces-near-me query is a later query and not a later migration.
--
-- Additive and idempotent throughout.

alter table public.spaces
  add column if not exists street             text,
  add column if not exists city               text,
  add column if not exists region             text,
  add column if not exists postal_code        text,
  add column if not exists country            text,
  add column if not exists latitude           numeric,
  add column if not exists longitude          numeric,
  add column if not exists location_precision text not null default 'exact';

-- Drop-then-add so a re-run picks up a changed predicate rather than silently keeping the old one.
alter table public.spaces drop constraint if exists spaces_location_precision_check;
alter table public.spaces
  add constraint spaces_location_precision_check
  check (location_precision in ('exact', 'approximate'));

-- Coordinates that are not coordinates would publish a pin somewhere off the coast of Africa, and
-- the read path's own guard would be the only thing standing between that and a member. Two guards.
alter table public.spaces drop constraint if exists spaces_latitude_range_check;
alter table public.spaces
  add constraint spaces_latitude_range_check
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.spaces drop constraint if exists spaces_longitude_range_check;
alter table public.spaces
  add constraint spaces_longitude_range_check
  check (longitude is null or (longitude >= -180 and longitude <= 180));

alter table public.spaces
  add column if not exists geog geography(Point, 4326)
  generated always as (
    case
      when latitude is not null and longitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
      else null
    end
  ) stored;

create index if not exists spaces_geog_gix
  on public.spaces using gist (geog);

-- The map's own read: active, network-visible, and actually placed. Partial, so it indexes the
-- handful of rows the loader wants rather than every Space that will never carry a coordinate.
create index if not exists spaces_mappable_idx
  on public.spaces (status, visibility)
  where latitude is not null and longitude is not null;

comment on column public.spaces.latitude is
  'The TRUE latitude of the Space, as its owner placed the pin. NEVER publish this without consulting location_precision: an approximate Space must be coarsened through lib/maps/approximate.ts first.';
comment on column public.spaces.longitude is
  'The TRUE longitude of the Space, as its owner placed the pin. NEVER publish this without consulting location_precision (see the latitude comment).';
comment on column public.spaces.location_precision is
  'How precisely this Space allows its location to be published. exact = the pin is the coordinate. approximate = the read path snaps it to a ~1 km grid cell first (lib/maps/approximate.ts), for a Space run out of a home. Default exact is safe because the coordinate columns start NULL, so a Space has no published location until its owner deliberately sets one.';
comment on column public.spaces.geog is
  'Auto-generated PostGIS point from latitude/longitude (SRID 4326). Use for proximity queries; do not write directly. Carries the TRUE point, so the same location_precision rule applies to anything derived from it.';
comment on column public.spaces.street is
  'Street line of the Space address. The structured counterpart to the legacy free-text preferences.profile.address, which drives the Contact card map link.';
