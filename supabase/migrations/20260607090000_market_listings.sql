-- =============================================================================
-- Local Marketplace (vertical 5) — foundation (ADR-148)
--
-- Foundation entity, **no fee, no in-app payment** (DEVELOPMENT-MAP Stage B;
-- PLATFORM-VISION §verticals): geolocated goods/services that members swap, give,
-- lend, or request — anti-consumerism, local mutual support. Payment is arranged
-- offline; we only connect people (reuse DMs). Lighter trust-&-safety than a paid
-- marketplace precisely because no money moves here.
--
-- Locality: a listing can anchor to a `circle` (its place in the tree) and/or carry
-- free-text neighborhood/city + optional lat/lng (for a future "near me" sort).
-- Writes go through the service-role admin client behind app-code authz (repo
-- convention, like practices/journey_plans); RLS governs any direct user reads.
-- =============================================================================

create table if not exists public.market_listings (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid references public.profiles(id) on delete cascade,
  title        text not null,
  description  text,
  kind         text not null default 'offer' check (kind in ('offer','request','free','lend')),
  category     text,
  -- Free-text only; there is NO payment processing in this vertical.
  price_note   text,
  status       text not null default 'active' check (status in ('active','claimed','closed')),
  images       text[] not null default '{}',
  neighborhood text,
  city         text,
  latitude     double precision,
  longitude    double precision,
  circle_id    uuid references public.circles(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists market_listings_status_idx on public.market_listings (status, created_at desc);
create index if not exists market_listings_author_idx on public.market_listings (author_id);
create index if not exists market_listings_circle_idx on public.market_listings (circle_id);
create index if not exists market_listings_kind_idx   on public.market_listings (kind);
create index if not exists market_listings_demo_idx   on public.market_listings (is_demo) where is_demo;

alter table public.market_listings enable row level security;

-- Read: anyone sees active listings; an author sees their own at any status.
drop policy if exists market_listings_select on public.market_listings;
create policy market_listings_select on public.market_listings
  for select using (status = 'active' or author_id = get_my_profile_id());

-- Write: an author manages only their own rows (the service-role client bypasses
-- this; these guard any direct user-client access).
drop policy if exists market_listings_insert on public.market_listings;
create policy market_listings_insert on public.market_listings
  for insert with check (author_id = get_my_profile_id());

drop policy if exists market_listings_update on public.market_listings;
create policy market_listings_update on public.market_listings
  for update using (author_id = get_my_profile_id());

drop policy if exists market_listings_delete on public.market_listings;
create policy market_listings_delete on public.market_listings
  for delete using (author_id = get_my_profile_id());
