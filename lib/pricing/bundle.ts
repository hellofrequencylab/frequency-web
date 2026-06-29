// HOUSEHOLD / CIRCLE BUNDLE — the multi-seat bundle pricing path (ADR-370, REMAINING-WORK #6; the
// owner's spec calls it a Phase 2 bundle). ONE paid subscription that seats several members at a
// per-bundle price. The bundle OWNER (payer) holds the Stripe subscription; each seated member points
// at the owner via profiles.household_bundle_id (migration 20260727000000).
//
// This module is the PURE config + helpers (no Supabase/Next), like lib/pricing/plans.ts: it shapes
// the operator bundle settings and resolves the price key. The gated checkout IO lives in
// lib/billing/bundle-checkout.ts; the sell gate (bundleSellable) lives in lib/pricing/settings.ts
// alongside memberTierSellable / spacePlanSellable.
//
// EVERYTHING SHIPS OFF (the ABSOLUTE INVARIANT, ADR-370): the bundle is never sellable while billing
// is OFF (bundleSellable = billingLive() AND bundle_household_enabled, FAIL-SAFE FALSE), so no member
// is ever seated and household_bundle_id stays NULL for everyone.

import type { EntitlementTier } from '@/lib/core/entitlement'
import type { BillingPeriod } from '@/lib/billing/pricing-keys'

/** The bundle's editable config (pricing_settings key 'household_bundle'). Seats + price (cents) + the
 *  member tier each seat is granted (crew by default). Mirrors the migration seed. */
export interface HouseholdBundleConfig {
  /** How many member seats the bundle includes (the owner + their household / Circle). */
  seats: number
  monthly_cents: number
  annual_cents: number | null
  /** The personal tier each seated member is granted while the bundle is active. */
  tier: EntitlementTier
}

/** The seeded launch-target bundle (kept in sync with 20260727000000_pricing_deferred_gates.sql). */
export const HOUSEHOLD_BUNDLE_DEFAULT: HouseholdBundleConfig = {
  seats: 4,
  monthly_cents: 2400,
  annual_cents: 24000,
  tier: 'crew',
}

/** Narrow a raw pricing_settings value to a HouseholdBundleConfig, FAIL-SAFE to the default for any
 *  missing/garbage field (so the bundle config always renders). PURE. */
export function asHouseholdBundleConfig(raw: unknown): HouseholdBundleConfig {
  if (!raw || typeof raw !== 'object') return HOUSEHOLD_BUNDLE_DEFAULT
  const r = raw as Record<string, unknown>
  const seats = typeof r.seats === 'number' && r.seats > 0 ? Math.floor(r.seats) : HOUSEHOLD_BUNDLE_DEFAULT.seats
  const monthly = typeof r.monthly_cents === 'number' ? r.monthly_cents : HOUSEHOLD_BUNDLE_DEFAULT.monthly_cents
  const annual =
    r.annual_cents === null ? null : typeof r.annual_cents === 'number' ? r.annual_cents : HOUSEHOLD_BUNDLE_DEFAULT.annual_cents
  const tier = r.tier === 'crew' || r.tier === 'supporter' ? (r.tier as EntitlementTier) : HOUSEHOLD_BUNDLE_DEFAULT.tier
  return { seats, monthly_cents: monthly, annual_cents: annual, tier }
}

/** The pricing_stripe_prices key for the bundle at a billing period: 'household_monthly' /
 *  'household_annual'. Mirrors the priceKey convention in lib/billing/pricing-keys.ts. PURE. */
export function householdBundlePriceKey(period: BillingPeriod): string {
  return `household_${period}`
}

/** How many seats remain in a bundle given its config + the count already seated (the owner counts as a
 *  seat). Never negative. PURE — the IO that counts seated members lives in the checkout/seat helpers. */
export function bundleSeatsRemaining(config: HouseholdBundleConfig, seatedCount: number): number {
  return Math.max(0, config.seats - Math.max(0, seatedCount))
}
