// PRICING KEYS — the pure mapping between (tier|plan, billing period, founder?) and the
// `pricing_stripe_prices` row key, plus the catalog of which keys exist (Pricing P2, ADR-363).
// PURE + framework-independent (no Stripe/Supabase/Next), like lib/billing/fees.ts, so the
// key resolution + founder-lock selection are trivially unit-testable.
//
// A key is `<tier|plan>_<period>` with an optional `_founder` suffix for the founder-locked
// variant. The founder variant is stored archived (not offered publicly) but referenced by a
// founding member's profiles.locked_price_id at checkout.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { type SpacePlan } from '@/lib/pricing/plans'

/** A subscription billing period. */
export type BillingPeriod = 'monthly' | 'annual'

/** The member (personal) tiers that are sold (free is never a paid key). */
export const MEMBER_TIER_KEYS = ['crew', 'supporter'] as const
export type MemberTierKey = (typeof MEMBER_TIER_KEYS)[number]

/** The space-plan price-catalog keys that are SOLD self-serve. NOTE (ADR-458): this is the STRIPE
 *  CATALOG axis, frozen on the LEGACY plan/add-on key names until Phase B rewrites the catalog into
 *  pro base + the four add-on items + the nonprofit seat. It is deliberately decoupled from the new
 *  SPACE_PLANS (free/pro/nonprofit/organization) so Phase A can collapse the plan model without
 *  churning the Stripe price keys. Partner is comped, so it is intentionally not here. */
export const SPACE_PLAN_KEYS = ['practitioner', 'business', 'nonprofit', 'organization', 'whitelabel'] as const
export type SpacePlanKey = (typeof SPACE_PLAN_KEYS)[number]

/** Which billing periods each tier/plan offers (mirrors PRICING_DEFAULTS: organization +
 *  whitelabel are monthly-only). The source of truth for "is there an annual price?". */
export const PERIODS_BY_KEY: Record<MemberTierKey | SpacePlanKey, readonly BillingPeriod[]> = {
  crew: ['monthly', 'annual'],
  supporter: ['monthly', 'annual'],
  practitioner: ['monthly', 'annual'],
  business: ['monthly', 'annual'],
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

/** Narrow a plan label to a paid Stripe price-catalog key, or null for 'free'/unknown (default-deny).
 *  PURE. Checks the catalog key list directly (the legacy key axis, see SPACE_PLAN_KEYS), so it stays
 *  correct independent of the new SPACE_PLANS collapse until Phase B rewrites the catalog. */
export function asSpacePlanKey(plan: SpacePlan | string | null | undefined): SpacePlanKey | null {
  return (SPACE_PLAN_KEYS as readonly string[]).includes(plan ?? '') ? (plan as SpacePlanKey) : null
}

/** The take-rate basis points key in pricing_settings.take_rate for a space plan. PURE.
 *  practitioner/business/organization have explicit bps; whitelabel inherits organization's (the
 *  lowest published rate). Returns the bps from the provided take_rate map, default-safe. */
export function takeRateBpsForPlan(
  plan: SpacePlan | string | null | undefined,
  takeRate: { practitioner_bps: number; business_bps: number; organization_bps: number },
): number {
  switch (asSpacePlanKey(plan)) {
    case 'practitioner':
      return takeRate.practitioner_bps
    case 'business':
      return takeRate.business_bps
    case 'organization':
      return takeRate.organization_bps
    case 'whitelabel':
      // White-label has no separate published take-rate; use the lowest (organization) rate.
      return takeRate.organization_bps
    default:
      // free / unknown plan: no published rate → fall back to the practitioner rate (the
      // entry paid rate) so a misconfigured space never charges a 0% (under-collect) fee.
      return takeRate.practitioner_bps
  }
}

/** The application-fee cents on a gross charge for a space plan's take-rate. PURE (no I/O).
 *  Floors fractional cents so the recipient is never short-changed (mirrors platformFeeCents). */
export function takeRateCents(
  grossCents: number,
  plan: SpacePlan | string | null | undefined,
  takeRate: { practitioner_bps: number; business_bps: number; organization_bps: number },
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
