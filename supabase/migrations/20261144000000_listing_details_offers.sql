-- Marketplace listing detail redesign: compact item detail fields, a general/exact pickup location,
-- and a lightweight offers feed (the Contact dialog's "make an offer" + the right-rail "highest offer").
-- Additive + idempotent, safe to re-run. No em/en dashes in surfaced copy.
--
-- WHY here (not on `listings`/`commerce_products`): the offers + rich details + pickup surface live on the
-- CLASSIFIEDS listing first (market_listings). The offers table is POLYMORPHIC (target_kind + target_id,
-- exactly like listing_comments / marketplace_reports) so Market goods can opt in later without a reshape,
-- while Housing (message-the-host) simply never writes an offer.

-- ── market_listings: compact detail fields + pickup location ──────────────────────────────────────
-- details: an ordered array of {label, value} chips the seller adds (Condition, Brand, Dimensions, ...),
-- rendered compactly in the right rail. Free-form so a seller can describe anything without a fixed schema.
alter table public.market_listings
  add column if not exists details jsonb not null default '[]'::jsonb;

-- pickup_address: the seller's EXACT pickup address (private by default). pickup_precision gates whether
-- the exact address is ever shown publicly: 'area' (default) shows only the approximate neighborhood/city
-- + an approximate-area map from the existing latitude/longitude; 'exact' reveals the full address. The
-- seller owns this toggle ("never show the exact address until the seller approves it").
alter table public.market_listings
  add column if not exists pickup_address text;
alter table public.market_listings
  add column if not exists pickup_precision text not null default 'area';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'market_listings_pickup_precision_check') then
    alter table public.market_listings
      add constraint market_listings_pickup_precision_check
      check (pickup_precision in ('area', 'exact'));
  end if;
end $$;

-- ── listing_offers: the "make an offer" feed ──────────────────────────────────────────────────────
-- One row per offer. The buyer submits an amount (+ optional note) from the Contact dialog; it also opens
-- a DM to the seller. The right-rail "Highest offer" is the MAX(amount_cents) of open offers, computed
-- server-side through the admin client (never leaked per-buyer) so browsers see only the aggregate number.
create table if not exists public.listing_offers (
  id           uuid primary key default gen_random_uuid(),
  target_kind  text not null check (target_kind in ('market_listing', 'listing', 'product')),
  target_id    uuid not null,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  message      text,
  status       text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  created_at   timestamptz not null default now()
);

-- Highest-open-offer + per-listing history lookups.
create index if not exists listing_offers_target_idx
  on public.listing_offers (target_kind, target_id, status, amount_cents desc);

alter table public.listing_offers enable row level security;

-- Read: the offering buyer sees their OWN offers; the listing owner sees every offer on their listing;
-- staff sees all. There is no public row read (the public page shows only the server-computed MAX).
drop policy if exists listing_offers_select on public.listing_offers;
create policy listing_offers_select on public.listing_offers
  for select to authenticated
  using (
    profile_id = public.get_my_profile_id()
    or public.get_my_web_role() in ('admin', 'janitor')
    or (
      target_kind = 'market_listing' and exists (
        select 1 from public.market_listings m
        where m.id = listing_offers.target_id and m.author_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'listing' and exists (
        select 1 from public.listings l
        where l.id = listing_offers.target_id and l.owner_profile_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'product' and exists (
        select 1 from public.commerce_products p
        where p.id = listing_offers.target_id and p.owner_profile_id = public.get_my_profile_id()
      )
    )
  );

-- Insert: any signed-in member, and only ever as themselves (unforgeable author). The service-role
-- client bypasses this. App code additionally gates that a buyer cannot offer on their own listing.
drop policy if exists listing_offers_insert on public.listing_offers;
create policy listing_offers_insert on public.listing_offers
  for insert to authenticated
  with check (profile_id = public.get_my_profile_id());

-- Update: the buyer may withdraw their own offer; the listing owner/staff may accept/decline. The owner
-- branch resolves polymorphically. (All writes flow through gated server actions; this is defense in depth.)
drop policy if exists listing_offers_update on public.listing_offers;
create policy listing_offers_update on public.listing_offers
  for update to authenticated
  using (
    profile_id = public.get_my_profile_id()
    or public.get_my_web_role() in ('admin', 'janitor')
    or (
      target_kind = 'market_listing' and exists (
        select 1 from public.market_listings m
        where m.id = listing_offers.target_id and m.author_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'listing' and exists (
        select 1 from public.listings l
        where l.id = listing_offers.target_id and l.owner_profile_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'product' and exists (
        select 1 from public.commerce_products p
        where p.id = listing_offers.target_id and p.owner_profile_id = public.get_my_profile_id()
      )
    )
  );

comment on table public.listing_offers is
  'Buyer offers on a marketplace listing (Classifieds market_listings first; polymorphic target_kind + target_id like listing_comments so Market/Housing can opt in). Buyer/owner/staff read; any member inserts as themselves; buyer withdraws, owner accepts/declines. The public page shows only the server-computed MAX(open amount). Written through lib/marketplace/listing-offers.ts.';

comment on column public.market_listings.details is
  'Ordered [{label, value}] item detail chips (Condition, Brand, ...), rendered compactly in the listing right rail.';
comment on column public.market_listings.pickup_precision is
  'area (default) shows only the approximate neighborhood/city + area map; exact reveals pickup_address. Seller-controlled.';

-- ROLLBACK:
--   drop table if exists public.listing_offers;
--   alter table public.market_listings drop column if exists details, drop column if exists pickup_address, drop column if exists pickup_precision;
