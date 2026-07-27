-- =============================================================================
-- Housing Tier B — richer listing fields behind an address-precision setting (ADR-867)
--
-- The audit's queued follow-up to Tier A (ADR-861): the structured facts members
-- actually decide on (parking, laundry, move-in costs, stay bounds, occupancy,
-- accessibility) plus a member-chosen address_precision that controls how much of
-- the location the listing shows. address_line is the ONLY column here that can
-- carry a street address, and the app contract is strict: it renders only when
-- address_precision = 'exact' AND the viewer is signed in, and it NEVER reaches
-- JSON-LD, meta tags, or the sitemap (public structured data stays coarse,
-- addressLocality only — the fair-housing/privacy posture of ADR-861 unchanged).
--
-- Fair housing: every column below is a fact about the HOME, never about who
-- should apply. No tenant-demographic fields are added, ever.
--
-- Written by the Tier B session; APPLIED BY THE MAIN SESSION (file-only here).
-- Read/written via the untyped admin-client cast pattern (ADR-246); the generated
-- lib/database.types.ts is deliberately NOT regenerated here.
-- =============================================================================

-- ── Richer typed attributes ──────────────────────────────────────────────────
alter table public.housing_listings
  add column if not exists parking text
    check (parking is null or parking in ('none','street','driveway','garage')),
  add column if not exists laundry text
    check (laundry is null or laundry in ('none','in_unit','on_site','nearby')),
  add column if not exists bathrooms_shared boolean,
  add column if not exists move_in_costs_cents bigint
    check (move_in_costs_cents is null or move_in_costs_cents >= 0),
  add column if not exists min_stay_months integer
    check (min_stay_months is null or min_stay_months >= 1),
  add column if not exists max_occupants integer
    check (max_occupants is null or max_occupants >= 1),
  add column if not exists accessibility jsonb not null default '[]'::jsonb,
  add column if not exists address_precision text not null default 'city'
    check (address_precision in ('city','neighborhood','exact')),
  add column if not exists address_line text
    check (address_line is null or char_length(address_line) <= 200);

-- Controlled accessibility vocabulary — a jsonb array whose every element must be
-- one of the known tags (jsonb array containment mirrors the amenities <@ pattern).
alter table public.housing_listings
  drop constraint if exists housing_listings_accessibility_vocab;
alter table public.housing_listings
  add constraint housing_listings_accessibility_vocab check (
    jsonb_typeof(accessibility) = 'array'
    and accessibility <@ '["step_free","elevator","ground_floor","wide_doorways","roll_in_shower","grab_bars","accessible_parking"]'::jsonb
  );

comment on column public.housing_listings.parking is
  'Parking situation at the home (none/street/driveway/garage). A fact about the place, shown as a detail row. ADR-867.';
comment on column public.housing_listings.laundry is
  'Laundry situation (none/in_unit/on_site/nearby). ADR-867.';
comment on column public.housing_listings.bathrooms_shared is
  'True when the bathroom is shared with other people in the home. Null = not stated. ADR-867.';
comment on column public.housing_listings.move_in_costs_cents is
  'Total move-in cost beyond the deposit (first/last month, fees), in cents. Null = not stated. ADR-867.';
comment on column public.housing_listings.min_stay_months is
  'Shortest stay the host will take, in months. Null = no minimum stated. ADR-867.';
comment on column public.housing_listings.max_occupants is
  'Most people the place can house (an occupancy fact about the home, not a tenant preference). ADR-867.';
comment on column public.housing_listings.accessibility is
  'Controlled accessibility tags (step_free, elevator, ground_floor, wide_doorways, roll_in_shower, grab_bars, accessible_parking); jsonb array enforced by housing_listings_accessibility_vocab. ADR-867.';
comment on column public.housing_listings.address_precision is
  'Member-chosen display granularity for the listing location: city (default, city only), neighborhood (adds the neighborhood), exact (signed-in members also see address_line). ADR-867.';
comment on column public.housing_listings.address_line is
  'Street address, shown ONLY when address_precision = exact AND the viewer is signed in. NEVER emitted in JSON-LD, meta tags, or the sitemap — public structured data stays at addressLocality. ADR-867.';
