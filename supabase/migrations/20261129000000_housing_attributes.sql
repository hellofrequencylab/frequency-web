-- =============================================================================
-- Housing attributes — Phase 2 (property_type × listing_intent model)
--
-- Additive columns on the housing extension so a listing can carry the structured
-- attributes the rebuilt form now captures (property type, size, amenities, house
-- rules). Plus two new listing_type intents so a member can post that they're
-- LOOKING (roommate_wanted / housing_wanted), not only offering.
--
-- Read/written via the untyped admin-client cast pattern (ADR-246); the generated
-- lib/database.types.ts is deliberately NOT regenerated here.
-- =============================================================================

-- ── New typed attributes ─────────────────────────────────────────────────────
alter table public.housing_listings
  add column if not exists property_type text
    check (property_type is null or property_type in
      ('house','apartment','studio','condo','townhouse','room','other')),
  add column if not exists sqft integer
    check (sqft is null or sqft >= 0),
  add column if not exists amenities text[] not null default '{}',
  add column if not exists smoking_ok boolean,
  add column if not exists cannabis_ok boolean,
  -- Free-form extras (e.g. parking notes, floor, view) kept out of the typed set.
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Controlled amenity slug set — every element of `amenities` must be one of these.
-- A subset check (<@) enforces the vocabulary without a lookup table.
alter table public.housing_listings
  drop constraint if exists housing_listings_amenities_vocab;
alter table public.housing_listings
  add constraint housing_listings_amenities_vocab check (
    amenities <@ array[
      'in_unit_laundry','laundry_shared','ac','heat','dishwasher','parking',
      'garage','outdoor_space','internet','storage','pool','gym',
      'ev_charging','wheelchair_accessible'
    ]::text[]
  );

create index if not exists housing_listings_property_type_idx
  on public.housing_listings (property_type);
create index if not exists housing_listings_amenities_gin_idx
  on public.housing_listings using gin (amenities);

-- ── Widen listing_type: add the two "wanted" intents, keep the offer types ────
alter table public.housing_listings
  drop constraint if exists housing_listings_listing_type_check;
alter table public.housing_listings
  add constraint housing_listings_listing_type_check check (
    listing_type in ('rental','roommate','sublet','roommate_wanted','housing_wanted')
  );

comment on column public.housing_listings.property_type is
  'Physical form of the place (house/apartment/studio/condo/townhouse/room/other). Orthogonal to listing_type (the intent). ADR-39Y Phase 2.';
comment on column public.housing_listings.amenities is
  'Controlled slug set (in_unit_laundry, ac, parking, …); enforced by housing_listings_amenities_vocab + queried via a GIN index.';
comment on column public.housing_listings.details is
  'Free-form extras the typed columns do not cover (parking notes, floor, view). ADR-246 untyped access.';
