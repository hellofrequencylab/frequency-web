-- Shop & Marketplace rework, Phase 5 (ADR-596): the per-listing "publish to Market" opt-in.
--
-- A Space setting a listing status='active' means "live in my own Shop console/tab", which is NOT
-- consent to appear in the GLOBAL Market. So the umbrella reader (listMarketListings) filters on an
-- explicit `market_published` flag, not on status alone — otherwise aggregating would expose every
-- Space's entire catalog worldwide. A real indexed column (not a metadata JSON flag) so the reader can
-- FILTER + ORDER at scale (schema-as-source-of-truth).
--
-- SAFE TO APPLY NOW: additive + idempotent, visibility-only (no payment coupling). Applying it makes the
-- Market surface function; leaving it unapplied would break listMarketListings. (Distinct from the
-- Phase 4 booking migration, which is payment-gated and stays unapplied until payments are on.)

alter table public.commerce_products
  add column if not exists market_published boolean not null default false;

-- The umbrella reader's access path: active + market-published, grouped/sorted by kind then recency.
create index if not exists commerce_products_market_idx
  on public.commerce_products (product_kind, created_at desc)
  where status = 'active' and market_published;

-- Existing maker listings were already the Market's content, so keep them in Market unchanged (implicit
-- opt-in for the individual-maker path). Space listings default false and opt in per-listing from the
-- Shop console Catalog tab.
update public.commerce_products set market_published = true where vertical = 'maker';
