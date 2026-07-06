// PRICING KEYS — the pure mapping between (tier|plan, billing period, founder?) and the
// `pricing_stripe_prices` row key, plus the catalog of which keys exist (Pricing P2, ADR-363).
// PURE + framework-independent (no Stripe/Supabase/Next), like lib/billing/fees.ts, so the
// key resolution + founder-lock selection are trivially unit-testable.
//
// A key is `<tier|plan>_<period>` with an optional `_founder` suffix for the founder-locked
// variant. The founder variant is stored archived (not offered publicly) but referenced by a
// founding member's profiles.locked_price_id at checkout.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { SPACE_PLANS, asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

/** A subscription billing period. */
export type BillingPeriod = 'monthly' | 'annual'

/** The member (personal) tiers that are sold (free is never a paid key). */
export const MEMBER_TIER_KEYS = ['crew', 'supporter'] as const
export type MemberTierKey = (typeof MEMBER_TIER_KEYS)[number]

/** The space plans that are SOLD self-serve (free is never a paid key; Partner is comped/operator-
 *  assigned, so it is intentionally NOT here). */
export const SPACE_PLAN_KEYS = ['practitioner', 'business', 'brand', 'nonprofit', 'organization', 'whitelabel'] as const
export type SpacePlanKey = (typeof SPACE_PLAN_KEYS)[number]

/** Which billing periods each tier/plan offers (mirrors PRICING_DEFAULTS: organization +
 *  whitelabel are monthly-only). The source of truth for "is there an annual price?". */
export const PERIODS_BY_KEY: Record<MemberTierKey | SpacePlanKey, readonly BillingPeriod[]> = {
  crew: ['monthly', 'annual'],
  supporter: ['monthly', 'annual'],
  practitioner: ['monthly', 'annual'],
  business: ['monthly', 'annual'],
  brand: ['monthly', 'annual'],
  nonprofit: ['monthly', 'annual'],
  organization: ['monthly'],
  whitelabel: ['monthly'],
}

/** Does this tier/plan offer the given billing period? (organization/whitelabel are monthly-only.) */
export function offersPeriod(base: MemberTierKey | SpacePlanKey, period: BillingPeriod): boolean {
  return (PERIODS_BY_KEY[base] ?? []).includes(period)
}

/** The `pricing_stripe_prices` key for a base (tier|plan) + period, with the optional founder variant.
 *  PURE — e.g. priceKey('crew', 'monthly') = 'crew_monthly'; priceKey('crew','monthly',true) =
 *  'crew_monthly_founder'. */
export function priceKey(
  base: MemberTierKey | SpacePlanKey,
  period: BillingPeriod,
  founder = false,
): string {
  return `${base}_${period}${founder ? '_founder' : ''}`
}

/** Every PUBLIC price key (no founder variants) the catalog should hold, honoring monthly-only plans.
 *  PURE — the canonical list syncPricingProductsToStripe walks. */
export function allPublicPriceKeys(): string[] {
  const keys: string[] = []
  for (const base of [...MEMBER_TIER_KEYS, ...SPACE_PLAN_KEYS]) {
    for (const period of PERIODS_BY_KEY[base]) keys.push(priceKey(base, period))
  }
  return keys
}

/** Every FOUNDER price key (the locked-variant catalog). Founder lock applies to the personal member
 *  tiers (the founding-member program is personal, ADR-362). PURE. */
export function allFounderPriceKeys(): string[] {
  const keys: string[] = []
  for (const base of MEMBER_TIER_KEYS) {
    for (const period of PERIODS_BY_KEY[base]) keys.push(priceKey(base, period, true))
  }
  return keys
}

/** Narrow an EntitlementTier to a paid member key, or null for 'free'/unknown (default-deny). PURE. */
export function asMemberTierKey(tier: EntitlementTier | string | null | undefined): MemberTierKey | null {
  return (MEMBER_TIER_KEYS as readonly string[]).includes(tier ?? '') ? (tier as MemberTierKey) : null
}

/** Narrow a SpacePlan to a paid plan key, or null for 'free'/unknown (default-deny). PURE. */
export function asSpacePlanKey(plan: SpacePlan | string | null | undefined): SpacePlanKey | null {
  if (!(SPACE_PLANS as readonly string[]).includes(plan ?? '')) return null
  return (SPACE_PLAN_KEYS as readonly string[]).includes(plan ?? '') ? (plan as SpacePlanKey) : null
}

/** The Free-plan take-rate basis points used when pricing_settings doesn't specify one (5%). */
export const DEFAULT_FREE_TAKE_RATE_BPS = 500

/** The take-rate config read from pricing_settings.take_rate. Under connection-based pricing only
 *  `free_bps` is consulted; the per-paid-plan bps are retained for backward-compatible config but
 *  are no longer applied (every paid plan is 0%). */
export type TakeRateConfig = {
  free_bps?: number
  practitioner_bps?: number
  business_bps?: number
  organization_bps?: number
}

/** The take-rate basis points for a space plan under CONNECTION-BASED pricing (BUSINESS-ACCOUNTS-
 *  STRATEGY). PURE. The take-rate lives ONLY on the Free plan; every PAID Space plan is flat SaaS at
 *  0%. A profile-owned ('maker') or unknown seller has no paid Space plan, so it pays the Free rate.
 *  While billing is OFF nothing charges regardless (setSpacePlan is a no-op, no space is ever paid). */
export function takeRateBpsForPlan(
  plan: SpacePlan | string | null | undefined,
  takeRate: TakeRateConfig,
): number {
  const isPaidPlan = asSpacePlan(plan) !== 'free'
  return isPaidPlan ? 0 : takeRate.free_bps ?? DEFAULT_FREE_TAKE_RATE_BPS
}

/** The application-fee cents on a gross charge for a space plan's take-rate. PURE (no I/O).
 *  Floors fractional cents so the recipient is never short-changed (mirrors platformFeeCents). */
export function takeRateCents(
  grossCents: number,
  plan: SpacePlan | string | null | undefined,
  takeRate: TakeRateConfig,
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  const bps = takeRateBpsForPlan(plan, takeRate)
  return Math.floor((grossCents * bps) / 10000)
}

/** The price key a member should be charged at, honoring the founder lock. PURE selection logic
 *  (the actual price id is resolved from the map by the caller). If the member is a founding member
 *  AND a founder variant exists in the catalog for this base+period, return the founder key; else the
 *  public key. The locked_price_id (a concrete Stripe price id) takes precedence over BOTH when set;
 *  this returns the KEY to look up only when there's no explicit locked id. */
export function memberCheckoutPriceKey(opts: {
  base: MemberTierKey
  period: BillingPeriod
  isFoundingMember: boolean
}): string {
  if (opts.isFoundingMember && offersPeriod(opts.base, opts.period)) {
    return priceKey(opts.base, opts.period, true)
  }
  return priceKey(opts.base, opts.period)
}
