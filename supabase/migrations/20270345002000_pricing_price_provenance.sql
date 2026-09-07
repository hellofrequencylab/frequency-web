-- HYG-049 (ADR-1227): a synced Stripe price row records WHICH account and WHICH mode minted it.
--
-- pricing_stripe_prices.stripe_price_id was a bare text column. Nothing recorded the Stripe account
-- or livemode that created it, and resolveStripePriceId handed it straight to checkout.sessions.create.
-- If STRIPE_SECRET_KEY is ever rotated to a different account (a new license, a test/live swap),
-- every row silently points at a foreign price and Stripe answers "No such price" — which the member
-- sees as "Stripe could not complete that just now", indistinguishable from a transient outage.
--
-- Two nullable columns, stamped by syncPricingProductsToStripe / syncPricingCatalogToStripe at write
-- time and compared by resolveStripePriceId against the key in force. NULL means "synced before this
-- migration": the resolver treats an unstamped row as it always did (allowed), and a re-sync stamps it.
--
-- House style: additive + idempotent, expand-only, nothing dropped or made NOT NULL. Safe to re-run.
-- Applying is two steps (supabase/migrations/README.md): apply, then record the version.
--
-- ROLLBACK (manual; never auto-reverted):
--   alter table public.pricing_stripe_prices drop column if exists stripe_account_id;
--   alter table public.pricing_stripe_prices drop column if exists livemode;

alter table public.pricing_stripe_prices
  add column if not exists stripe_account_id text;
comment on column public.pricing_stripe_prices.stripe_account_id is
  'The Stripe account (acct_…) whose key minted stripe_price_id (HYG-049, ADR-1227). NULL = synced before provenance was recorded. resolveStripePriceId refuses a row whose account differs from the key in force.';

alter table public.pricing_stripe_prices
  add column if not exists livemode boolean;
comment on column public.pricing_stripe_prices.livemode is
  'Whether stripe_price_id was minted with a live-mode key (true) or a test-mode key (false) (HYG-049, ADR-1227). NULL = synced before provenance was recorded. A row minted in the other mode is refused at resolve time.';
