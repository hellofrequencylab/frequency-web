-- =============================================================================
-- Listings core (connect-only) + Housing vertical (ADR-39Y, draft)
--
-- Foundation entity, NO in-app payment (ADR-148 principle carried forward):
-- General goods and Housing connect people, they don't move money. A shared
-- `listings` base carries the common contract; per-vertical 1:1 extension tables
-- (housing_listings, …) carry typed attributes — the "shared base + per-vertical
-- extension" model chosen for this build.
--
-- The existing live `market_listings` table (ADR-148) stays as the General
-- marketplace for now; an OPTIONAL Phase-2 fold-in into `listings` + a
-- `market_details` ext is sketched in docs/01-SCHEMA.md (non-blocking).
--
-- Geo mirrors the connection layer: optional precise lat/lng + a generated,
-- privacy-fuzzed geocell (~1.1 km) for "near me" without exposing coordinates.
-- =============================================================================

-- ── Shared base ──────────────────────────────────────────────────────────────
create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  vertical         text not null check (vertical in ('market','housing')),
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  entity_id        uuid not null references public.entities(id),
  title            text not null,
  description      text,
  status           text not null default 'active' check (status in ('active','claimed','closed')),
  images           text[] not null default '{}',
  price_note       text,                  -- free-text only; contact via DMs (ADR-148)
  category         text,
  -- Locality.
  neighborhood     text,
  city             text,
  latitude         double precision,
  longitude        double precision,
  geocell_lat      numeric(6,2) generated always as (round(latitude::numeric, 2)) stored,
  geocell_lng      numeric(6,2) generated always as (round(longitude::numeric, 2)) stored,
  circle_id        uuid references public.circles(id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists listings_vertical_status_idx on public.listings (vertical, status, created_at desc);
create index if not exists listings_owner_idx on public.listings (owner_profile_id);
create index if not exists listings_geocell_idx on public.listings (geocell_lat, geocell_lng) where geocell_lat is not null;
create index if not exists listings_circle_idx on public.listings (circle_id);
create index if not exists listings_demo_idx on public.listings (is_demo) where is_demo;

create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function set_updated_at();

alter table public.listings enable row level security;

drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings
  for select using (status = 'active' or owner_profile_id = get_my_profile_id());

drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings
  for insert with check (owner_profile_id = get_my_profile_id());

drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings
  for update using (owner_profile_id = get_my_profile_id());

drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings
  for delete using (owner_profile_id = get_my_profile_id());

comment on table public.listings is
  'Shared connect-only listing base (General + Housing). No in-app payment (ADR-148). Per-vertical typed attributes live in 1:1 extension tables. ADR-39Y.';

-- ── Housing extension ────────────────────────────────────────────────────────
create table if not exists public.housing_listings (
  listing_id         uuid primary key references public.listings(id) on delete cascade,
  listing_type       text not null check (listing_type in ('rental','roommate','sublet')),
  rent_cents         integer check (rent_cents is null or rent_cents >= 0),
  deposit_cents      integer check (deposit_cents is null or deposit_cents >= 0),
  bedrooms           smallint check (bedrooms is null or bedrooms >= 0),
  bathrooms          numeric(3,1) check (bathrooms is null or bathrooms >= 0),
  room_type          text check (room_type in ('private_room','shared_room','entire_place')),
  lease_months       smallint check (lease_months is null or lease_months >= 0), -- 0 = month-to-month
  available_from     date,
  furnished          boolean,
  pets_ok            boolean,
  utilities_included boolean,
  household_size     smallint check (household_size is null or household_size >= 0),
  -- Structured roommate signals used by housing_match_candidates() (lifestyle, schedule, etc.).
  preferences        jsonb not null default '{}'::jsonb
);
create index if not exists housing_listings_type_idx on public.housing_listings (listing_type);
create index if not exists housing_listings_rent_idx on public.housing_listings (rent_cents);

-- Inherit base RLS by join (no money here, so reads are public-active).
alter table public.housing_listings enable row level security;
drop policy if exists housing_listings_select on public.housing_listings;
create policy housing_listings_select on public.housing_listings
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.owner_profile_id = get_my_profile_id())
    )
  );

-- ── Seeker profiles (a member looking for a room/roommate) ───────────────────
-- The other half of roommate matching: what the SEEKER wants. Compatibility is
-- computed against roommate listings' owners via the existing resonance engine.
create table if not exists public.housing_seeker_profiles (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  active          boolean not null default true,
  budget_min_cents integer check (budget_min_cents is null or budget_min_cents >= 0),
  budget_max_cents integer check (budget_max_cents is null or budget_max_cents >= 0),
  move_in_from    date,
  search_city     text,
  search_lat      double precision,
  search_lng      double precision,
  search_radius_m integer not null default 25000,
  preferences     jsonb not null default '{}'::jsonb,   -- lifestyle/schedule for compatibility
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_housing_seeker_profiles_updated_at
  before update on public.housing_seeker_profiles
  for each row execute function set_updated_at();

alter table public.housing_seeker_profiles enable row level security;
drop policy if exists housing_seeker_self on public.housing_seeker_profiles;
create policy housing_seeker_self on public.housing_seeker_profiles
  for all using (profile_id = get_my_profile_id()) with check (profile_id = get_my_profile_id());

-- ── Cross-cutting: saves (favorites) + reports (T&S) ─────────────────────────
create table if not exists public.listing_saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);
alter table public.listing_saves enable row level security;
drop policy if exists listing_saves_self on public.listing_saves;
create policy listing_saves_self on public.listing_saves
  for all using (profile_id = get_my_profile_id()) with check (profile_id = get_my_profile_id());

-- One reports table spans listings AND commerce products (polymorphic by target_kind).
create table if not exists public.marketplace_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles(id) on delete set null,
  target_kind  text not null check (target_kind in ('listing','product','order','profile')),
  target_id    uuid not null,
  reason       text not null,
  detail       text,
  status       text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at   timestamptz not null default now()
);
create index if not exists marketplace_reports_target_idx on public.marketplace_reports (target_kind, target_id);
create index if not exists marketplace_reports_status_idx on public.marketplace_reports (status, created_at desc);

alter table public.marketplace_reports enable row level security;
drop policy if exists marketplace_reports_insert on public.marketplace_reports;
create policy marketplace_reports_insert on public.marketplace_reports
  for insert with check (reporter_id = get_my_profile_id());
drop policy if exists marketplace_reports_read_own on public.marketplace_reports;
create policy marketplace_reports_read_own on public.marketplace_reports
  for select using (reporter_id = get_my_profile_id());
-- Moderators read/triage via the service-role admin client (operator surface).
