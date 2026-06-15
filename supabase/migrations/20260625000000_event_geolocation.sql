-- =============================================================================
-- Events foundation B1 — event geolocation (EVENTS-REWORK §"Schema deltas", the
-- first of the three foundational gaps).
--
-- WHY: events have no location of their own. `events.location` is free text and
-- all map/distance logic rides on the hosting *Circle's* geog point, so a real
-- "near me" catalog is impossible for standalone or multi-venue events. This
-- gives events first-class geography + a structured address + an attendance mode.
--
-- DESIGN NOTES (mirrors 20240214000000_enable_postgis_geography +
-- 20260603000006_circles_near_rpc — do not invent new conventions):
--   • geog is NOT a GENERATED column (unlike circles.geog). An event has no
--     latitude/longitude source columns to derive from; geocoding happens in the
--     app on save (lib/events/geocode.ts), which then writes geog directly. So it
--     is a plain nullable column the writer sets — never auto-maintained.
--   • PostGIS lives in the `public` schema here (enable_postgis_geography ran
--     `create extension postgis` with no schema, so it landed in public — same as
--     node_geo's public.st_* qualification). Every PostGIS call below is therefore
--     schema-qualified as public.* so it resolves under `set search_path = ''`.
--   • attendance_mode defaults to 'in_person' so every existing row keeps its
--     current meaning (a physical gathering). online/hybrid + online_url are new.
--   • Additive + backward-compatible: all new columns are nullable (or defaulted),
--     no existing read/write path changes, and geog stays NULL until a save
--     geocodes the venue.
-- =============================================================================

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.events
  -- App-maintained point (SRID 4326). Set on save by the geocode hook; NOT
  -- generated (no lat/lng source columns to derive from). NULL = not geocoded.
  add column if not exists geog            geography(Point, 4326),
  -- Structured address. All optional: a free-form `location` still works, and
  -- online events have no address at all.
  add column if not exists venue_name      text,
  add column if not exists street          text,
  add column if not exists city            text,
  add column if not exists region          text,   -- state / province
  add column if not exists country         text,   -- ISO-3166 alpha-2 preferred
  add column if not exists postal_code     text,
  -- in_person (default, = today's behaviour) | online | hybrid.
  add column if not exists attendance_mode text not null default 'in_person',
  -- Join link for online / hybrid events. NULL for in_person.
  add column if not exists online_url      text;

alter table public.events drop constraint if exists events_attendance_mode_check;
alter table public.events add constraint events_attendance_mode_check
  check (attendance_mode in ('in_person', 'online', 'hybrid'));

comment on column public.events.geog is
  'App-maintained PostGIS point (SRID 4326), set on save by the geocode hook (lib/events/geocode.ts). NOT generated — events have no lat/lng source columns. NULL until geocoded. Use for proximity (st_dwithin / <->).';
comment on column public.events.attendance_mode is
  'in_person (default; = pre-B1 behaviour) | online | hybrid. Drives schema.org eventAttendanceMode and whether geog / online_url apply.';

-- ── GiST index for radius / nearest-neighbour scans ──────────────────────────
create index if not exists events_geog_gix
  on public.events using gist (geog);

-- ── nearby_events — hardened, RLS-respecting proximity RPC ───────────────────
-- Mirrors circles_near's shape, with three deliberate differences for the catalog:
--   • SECURITY INVOKER (NOT definer): the events "visibility-aware read" RLS
--     (20260612000000) MUST still apply, so a caller only ever gets events they
--     could already SELECT. This is the whole point of "hardened + RLS-respecting".
--   • ST_DWithin(geog, point, radius_m) FIRST — a metres predicate the GiST index
--     can use to prune before distance is computed (the index-using filter).
--   • ORDER BY geog <-> point — KNN ordering, also index-assisted.
-- `language sql stable set search_path=''` + every object schema-qualified
-- (PostGIS functions live in public here) per pin_function_search_paths.
create or replace function public.nearby_events(
  _lat      double precision,
  _long     double precision,
  _radius_m double precision default 50000,
  _limit    integer          default 50
)
returns table (
  id              uuid,
  slug            text,
  title           text,
  description     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  venue_name      text,
  city            text,
  region          text,
  country         text,
  attendance_mode text,
  distance_m      double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
    e.venue_name, e.city, e.region, e.country, e.attendance_mode,
    public.st_distance(
      e.geog,
      public.st_setsrid(public.st_makepoint(_long, _lat), 4326)::public.geography
    ) as distance_m
  from public.events e
  where e.geog is not null
    and e.is_cancelled = false
    and public.st_dwithin(
          e.geog,
          public.st_setsrid(public.st_makepoint(_long, _lat), 4326)::public.geography,
          greatest(0, coalesce(_radius_m, 50000))
        )
  order by e.geog OPERATOR(public.<->) public.st_setsrid(public.st_makepoint(_long, _lat), 4326)::public.geography
  limit greatest(1, least(coalesce(_limit, 50), 200));
$$;

grant execute on function public.nearby_events(double precision, double precision, double precision, integer)
  to anon, authenticated;

comment on function public.nearby_events(double precision, double precision, double precision, integer) is
  'Geocoded, non-cancelled events within _radius_m metres of (_lat,_long), KNN-ordered by distance (EVENTS-REWORK B1). SECURITY INVOKER so the events visibility RLS still applies — callers only get events they may already read.';

-- ── set_event_geog — write the point from app-resolved lat/lng ───────────────
-- The geocode-on-save hook (lib/events/geocode.ts) resolves a lat/lng in JS and
-- calls this to persist events.geog, so WKT/SRID construction stays in SQL (never
-- hand-built in JS). SECURITY DEFINER + pinned search_path = '' per convention;
-- writes are driven by the service-role admin client (the save path), so this adds
-- no new client grant surface — it's executable by service_role only (no grant to
-- anon/authenticated below).
create or replace function public.set_event_geog(
  _event_id uuid,
  _lat      double precision,
  _long     double precision
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.events
     set geog = public.st_setsrid(public.st_makepoint(_long, _lat), 4326)::public.geography
   where id = _event_id;
$$;

comment on function public.set_event_geog(uuid, double precision, double precision) is
  'Persists events.geog from an app-resolved lat/long (EVENTS-REWORK B1 geocode-on-save). SECURITY DEFINER; service-role save path only, so SQL owns WKT/SRID construction.';

-- A Postgres function defaults to PUBLIC EXECUTE, and Supabase additionally grants anon +
-- authenticated by default — so "no grant" is NOT "no access". This is a SECURITY DEFINER WRITE
-- (it UPDATEs events.geog), so leaving it callable lets anon move any event's pin. Lock it to
-- service_role explicitly (the geocode-on-save path runs as service role).
revoke execute on function public.set_event_geog(uuid, double precision, double precision) from public, anon, authenticated;
grant  execute on function public.set_event_geog(uuid, double precision, double precision) to service_role;
