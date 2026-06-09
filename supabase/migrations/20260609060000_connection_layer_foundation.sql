-- =============================================================================
-- Connection Layer — foundation (ADR-186)
--
-- The privacy bedrock for member-to-member connection. Coordinates never leave the
-- DB: all member-visible proximity is computed server-side against a FUZZED geocell
-- (home rounded to ~1.1 km) and returned only as a coarse BAND, never meters or
-- lat/lng. The precise home_lat/lng stays private (self + circle leaders), exactly
-- as today. Everything here is additive + idempotent.
-- =============================================================================

-- ── Per-user connection & location privacy controls ──────────────────────────
alter table public.profiles
  -- Be listed in the Community directory at all.
  add column if not exists directory_visible boolean not null default true,
  -- Who can find me by proximity. 'community' = anyone; 'connections' = friends only;
  -- 'nobody' = never surfaced by location.
  add column if not exists discoverable_by text not null default 'community'
    check (discoverable_by in ('nobody', 'connections', 'community')),
  -- The COARSEST precision anyone may see for me. 'hidden' = no location shown;
  -- 'city' = city label only; 'neighborhood' = fuzzed ~1.1 km cell at most.
  add column if not exists location_band text not null default 'city'
    check (location_band in ('hidden', 'city', 'neighborhood')),
  -- My own "be findable within N metres" radius (the discoverability slider).
  add column if not exists discovery_radius_m integer not null default 40000
    check (discovery_radius_m between 0 and 200000),
  -- One-tap vanish from all proximity + maps.
  add column if not exists ghost_mode boolean not null default false;

-- ── Fuzzed location cell — the only coordinate other members are measured against.
-- Rounded to 2 decimal degrees (~1.1 km). Generated from the precise home point,
-- which itself stays private. NULL until a member sets a home location.
alter table public.profiles
  add column if not exists home_geocell_lat numeric(6, 2)
    generated always as (round(home_lat, 2)) stored,
  add column if not exists home_geocell_lng numeric(6, 2)
    generated always as (round(home_lng, 2)) stored;

create index if not exists profiles_home_geocell_idx
  on public.profiles (home_geocell_lat, home_geocell_lng)
  where home_geocell_lat is not null;

comment on column public.profiles.discoverable_by is
  'Who may find this member by proximity: nobody / connections / community (ADR-186).';
comment on column public.profiles.home_geocell_lat is
  'Home latitude fuzzed to ~1.1 km (round 2dp). The ONLY location other members are measured against; precise home_lat stays private (ADR-186).';

-- ── Connection-type on friendships (how the tie formed) ──────────────────────
alter table public.friendships
  add column if not exists how_met text
    check (how_met in ('in_person', 'online', 'unknown')) default 'unknown',
  add column if not exists met_context text,  -- free text or 'event:<id>' / 'circle:<id>'
  add column if not exists met_at timestamptz;

-- ── Platform-level connection settings (admin-gated singleton) ───────────────
create table if not exists public.connection_settings (
  id boolean primary key default true check (id),  -- single row
  directory_enabled       boolean not null default true,
  proximity_enabled       boolean not null default true,   -- members_near / nearby sort
  maps_enabled            boolean not null default false,  -- venue-snapped maps (P4)
  resonance_enabled       boolean not null default false,  -- orbits/resonance (P2)
  near_miss_enabled       boolean not null default false,  -- (P3)
  default_location_band   text not null default 'city'
    check (default_location_band in ('hidden', 'city', 'neighborhood')),
  min_discovery_radius_m  integer not null default 1000,
  max_discovery_radius_m  integer not null default 200000,
  reward_introduction     integer not null default 15,     -- gems (P3)
  reward_welcome          integer not null default 5,       -- gems (P3)
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles(id) on delete set null
);

insert into public.connection_settings (id) values (true) on conflict (id) do nothing;

alter table public.connection_settings enable row level security;

-- Public read (the UI needs to know what's enabled); all writes go through the
-- service role from an admin-gated action.
drop policy if exists "connection_settings read" on public.connection_settings;
create policy "connection_settings read" on public.connection_settings
  for select using (true);

comment on table public.connection_settings is
  'Platform-wide connection-layer config (master toggles, default band, radius bounds, reward values). Admin-gated; service-role write only (ADR-186).';

-- ── members_near — privacy-safe proximity directory ──────────────────────────
-- Returns members within the viewer's radius, ordered by FUZZED-cell distance, and
-- exposes only a coarse BAND label — never meters, never coordinates. Respects each
-- target's directory_visible / discoverable_by / ghost_mode and the 'hidden' band.
create or replace function public.members_near(
  _lat numeric,
  _lng numeric,
  _radius_m integer default 40000,
  _limit integer default 60
)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  community_role text,
  band           text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.profiles where auth_user_id = auth.uid()
  ),
  vcell as (
    select round(_lat, 2) as lat, round(_lng, 2) as lng
  ),
  candidates as (
    select
      p.id, p.display_name, p.handle, p.avatar_url, p.community_role::text as community_role,
      p.location_band,
      st_distance(
        st_setsrid(st_makepoint(p.home_geocell_lng::float8, p.home_geocell_lat::float8), 4326)::geography,
        st_setsrid(st_makepoint((select lng from vcell)::float8, (select lat from vcell)::float8), 4326)::geography
      ) as d
    from public.profiles p
    where p.directory_visible = true
      and p.ghost_mode = false
      and p.discoverable_by = 'community'
      and p.location_band <> 'hidden'
      and p.home_geocell_lat is not null
      and p.id <> coalesce((select id from me), '00000000-0000-0000-0000-000000000000'::uuid)
  )
  select
    c.id, c.display_name, c.handle, c.avatar_url, c.community_role,
    case
      -- A member who exposes only city-level precision is never shown finer than that,
      -- regardless of true proximity (ADR-186). Ranking still uses the fuzzed cell.
      when c.location_band = 'city' then 'your city'
      when c.d < 2000  then 'here'
      when c.d < 8000  then 'nearby'
      when c.d < 40000 then 'your area'
      else 'your city'
    end as band
  from candidates c
  where c.d <= _radius_m
  order by c.d asc
  limit greatest(_limit, 0);
$$;

comment on function public.members_near is
  'Privacy-safe proximity directory: members within radius, ordered by FUZZED-cell distance, returning only a coarse band label — never coordinates or meters (ADR-186).';
