-- Phase 0 (BUILD-PHASES): enable geospatial foundations.
--
-- PostGIS powers in-person Circle discovery ("circles near me"), geofencing, and
-- the future physical-gamification layer (ghost-node proximity, QR/NFC location
-- verification — see docs/ENGAGEMENT-ARCHITECTURE.md). Adding it now is cheap and
-- avoids a painful retrofit later. This migration is additive and idempotent.

create extension if not exists postgis;

-- A maintained `geog` point derived from the existing lat/lng. STORED + GENERATED
-- means it auto-syncs on every write and can never drift from latitude/longitude;
-- no trigger required (all functions used are immutable).
alter table public.circles
  add column if not exists geog geography(Point, 4326)
  generated always as (
    case
      when latitude is not null and longitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
      else null
    end
  ) stored;

-- GiST index for fast radius / nearest-neighbour queries (st_dwithin, <->).
create index if not exists circles_geog_gix
  on public.circles using gist (geog);

comment on column public.circles.geog is
  'Auto-generated PostGIS point from latitude/longitude (SRID 4326). Use for proximity queries; do not write directly.';
