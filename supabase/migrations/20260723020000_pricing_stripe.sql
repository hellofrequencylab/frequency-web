-- Pricing P2 — Stripe Products/Prices + subscriptions (docs/PRICING.md P2, ADR-363, builds on
-- ADR-362 / 20260723010000_pricing_foundation.sql). This migration adds the columns + the price-map
-- table the P2 Stripe wiring writes to. EVERYTHING STILL SHIPS OFF: no charge happens and no live
-- Stripe call fires unless an operator has set env keys AND flipped `billing_live` + the per-tier
-- switch. These columns/rows are inert until a gated checkout/webhook writes them.
--
-- House style (matches 20260723010000_pricing_foundation.sql): additive + idempotent, expand-only
-- (nothing dropped or made NOT NULL on an existing column). RLS on; the new operator-config table is
-- service-role / admin-gated with NO client policies, mirroring pricing_settings / pricing_feature_gates.
-- Applied to production via the Supabase SQL Editor (docs/WORKFLOW.md). lib/database.types.ts does not
-- yet carry these; the readers/writers (lib/billing/pricing-products.ts, lib/billing/space-plan-checkout.ts,
-- lib/billing/space-membership-checkout.ts, the webhook handlers) reach them with untyped casts (ADR-246)
-- and FAIL-SAFE. SAFE to re-run.
--
-- ROLLBACK (manual; this migration is never auto-reverted):
--   alter table public.space_membership_tiers drop column if exists stripe_product_id;
--   alter table public.space_memberships drop column if exists stripe_subscription_id;
--   alter table public.space_memberships drop column if exists payment_status;
--   alter table public.spaces drop column if exists stripe_customer_id;
--   alter table public.spaces drop column if exists stripe_subscription_id;
--   drop table if exists public.pricing_stripe_prices;

-- ── 1. space_membership_tiers: the resolved Stripe Product for a paid space tier ──────────────────
-- When a Space owner publishes a paid membership tier and billing is live, syncing it to Stripe
-- creates a Product; its id lands here so a member-join Checkout can reference the tier's Price.
alter table public.space_membership_tiers
  add column if not exists stripe_product_id text;
comment on column public.space_membership_tiers.stripe_product_id is
  'The Stripe Product id for this paid space membership tier (Pricing P2, ADR-363). NULL until billing is live and the tier is synced. Inert while billing_live is OFF.';

-- ── 2. space_memberships: the member''s subscription + payment status ──────────────────────────────
-- A member joining a PAID space tier (once billing is live) gets a Stripe subscription; its id + the
-- reconciled payment status land here, written by the gated space_membership Checkout + webhook.
alter table public.space_memberships
  add column if not exists stripe_subscription_id text;
comment on column public.space_memberships.stripe_subscription_id is
  'The Stripe Subscription id for a member''s paid space membership (Pricing P2, ADR-363). NULL for v1 display-only memberships and while billing is OFF.';

alter table public.space_memberships
  add column if not exists payment_status text
    check (payment_status in ('pending', 'active', 'past_due', 'canceled')) default 'pending';
comment on column public.space_memberships.payment_status is
  'Reconciled payment status of a paid space membership (Pricing P2, ADR-363): pending|active|past_due|canceled. Defaults pending; only ever advanced by the gated space_membership webhook. Display-only v1 memberships stay pending (no charge).';

-- ── 3. spaces: the owner''s plan subscription identifiers ─────────────────────────────────────────
-- A Space owner buying a plan (practitioner/business/…) gets a Stripe Customer + Subscription; their
-- ids land here so the webhook can reconcile plan changes/cancellations back to setSpacePlan.
alter table public.spaces
  add column if not exists stripe_customer_id text;
comment on column public.spaces.stripe_customer_id is
  'The Stripe Customer id for the Space''s plan subscription (the owner as customer; Pricing P2, ADR-363). NULL until the owner buys a plan with billing live.';

alter table public.spaces
  add column if not exists stripe_subscription_id text;
comment on column public.spaces.stripe_subscription_id is
  'The Stripe Subscription id for the Space''s active plan (Pricing P2, ADR-363). Set by the gated space_plan Checkout/webhook; NULL on the free plan or while billing is OFF.';

-- ── 4. pricing_stripe_prices: the key -> resolved Stripe Product/Price map ─────────────────────────
-- The bridge between the admin pricing_settings values and the live Stripe objects. syncPricingProducts-
-- ToStripe() (lib/billing/pricing-products.ts), invoked ONLY from an admin action when env keys are
-- present, creates a Product per tier + a Price per billing period and writes the resolved ids here.
-- Founder prices are stored as separate keys (e.g. crew_monthly_founder) with archived=true so they are
-- not offered publicly but can be referenced by profiles.locked_price_id at a founder''s checkout.
--
-- key examples: crew_monthly, crew_annual, supporter_monthly, supporter_annual, practitioner_monthly,
-- practitioner_annual, business_monthly, business_annual, organization_monthly, whitelabel_monthly,
-- and the *_founder variants. Service-role / admin-gated; read fail-safe (a missing row = "not synced").
create table if not exists public.pricing_stripe_prices (
  key               text primary key,
  stripe_product_id text,
  stripe_price_id   text,
  -- true = not offered to the public (founder-locked variants, or a retired price kept for reference).
  archived          boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id) on delete set null
);
comment on table public.pricing_stripe_prices is
  'Resolved Stripe Product/Price ids per pricing key (Pricing P2, ADR-363). Written by syncPricingProductsToStripe (lib/billing/pricing-products.ts), invoked only from the env-gated /admin/pricing "Sync products to Stripe" action. Founder-locked variants are stored archived=true so they can be referenced by profiles.locked_price_id but never offered publicly. Service-role / admin-gated; read fail-safe (a missing row = not synced).';
comment on column public.pricing_stripe_prices.key is
  'The pricing key, e.g. crew_monthly / practitioner_annual / crew_monthly_founder. <tier>_<period>[_founder].';
comment on column public.pricing_stripe_prices.archived is
  'true = not offered publicly (a founder-locked variant or a retired price kept for locked_price_id reference).';

alter table public.pricing_stripe_prices enable row level security;
-- No client policies on purpose: only the service-role admin client touches it (read server-side and
-- rendered in /admin/pricing; never exposed for a client-side write). Mirrors pricing_settings.
