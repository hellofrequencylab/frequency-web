-- =====================================================================
-- 🔴 SECURITY: the LISTING claim tokens had the same hole (third instance)
-- Siblings: 20270127000000 (spaces) · 20270128000000 (events)
-- =====================================================================
-- Found by surveying every table carrying a `claim_token` column while
-- designing the replacement system. `20261137000000_listing_seeder.sql`
-- mirrored the events pattern onto TWO more tables, and inherited the
-- defect with it.
--
-- Executed as `role anon` with RLS enforced, before this migration:
--   public.market_listings  ->  1 live token readable
--   public.listings         ->  0 today, column equally exposed
--
-- `listings` having no live token is timing, not safety: the column is
-- readable, so the first seeded housing listing would leak on creation.
-- Both are closed here.
--
-- Same root cause, same fix, same trap as the two siblings: a column-level
-- `revoke select (claim_token)` is a SILENT NO-OP against the table-wide
-- grant these roles hold. Drop the table-level SELECT, re-grant the public
-- columns explicitly.
--
-- ⚠️ Fail-closed on new columns; `select *` ERRORS rather than omitting.
-- Verified before applying: no `select('*')` against either table, and all
-- four modules that read these tokens (lib/listings/index.ts,
-- lib/listings/housing.ts, lib/marketplace.ts, lib/listing-seeder/claim.ts)
-- use the admin client, which column grants do not affect.
--
-- `claimed_at` and `claimed_by` stay readable here, unlike the spaces case:
-- the Classifieds and Housing UIs branch on "is this claimed?" from the
-- browser, and neither discloses a secret.
--
-- 🔴 THIS IS THE THIRD INSTANCE OF ONE BUG. Three tables, three migrations,
-- one mistake repeated by copy. The structural fix is a single
-- service_role-only token table so a fourth table cannot inherit it — see
-- ADR-907 and docs/CLAIM-LINKS.md. This migration stops the bleeding on
-- what exists today.
-- =====================================================================

revoke select on public.market_listings from anon, authenticated;

grant select (
  id, author_id, title, description, kind, category, price_note, status,
  images, neighborhood, city, latitude, longitude, circle_id, is_demo,
  created_at, updated_at, claimed_by, claimed_at, details, pickup_address,
  pickup_precision
) on public.market_listings to anon, authenticated;

revoke insert (claim_token) on public.market_listings from anon, authenticated;
revoke update (claim_token) on public.market_listings from anon, authenticated;

revoke select on public.listings from anon, authenticated;

grant select (
  id, vertical, owner_profile_id, entity_id, title, description, status,
  images, price_note, category, neighborhood, city, latitude, longitude,
  geocell_lat, geocell_lng, circle_id, is_demo, created_at, updated_at,
  claimed_by, claimed_at
) on public.listings to anon, authenticated;

revoke insert (claim_token) on public.listings from anon, authenticated;
revoke update (claim_token) on public.listings from anon, authenticated;

comment on column public.market_listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) listing. service_role ONLY: 20270129000000 revoked the table-wide SELECT and re-granted every column except this one, because market_listings is anon-readable at the ROW level and RLS cannot hide a column (a column-level revoke against a table-level grant is a silent no-op). A NEW public column needs its own explicit grant. New claim flows must use the claim_tokens table (ADR-907), not a column here.';

comment on column public.listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) housing listing. service_role ONLY: 20270129000000 revoked the table-wide SELECT and re-granted every column except this one, because listings is anon-readable at the ROW level and RLS cannot hide a column. A NEW public column needs its own explicit grant. New claim flows must use the claim_tokens table (ADR-907), not a column here.';
