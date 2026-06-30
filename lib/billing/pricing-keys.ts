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

// ── PHASE B: the CLEAN Stripe catalog (ADR-460, docs/PRICING-LADDER-PLAN.md §1a/§4/§5) ────────────
// The collapsed ladder (free / pro / nonprofit / organization) is sold as a set of CATALOG ITEMS, one
// Stripe Product each, each carrying FOUR prices: { list, founding } x { month, year }. This replaces
// the legacy per-plan key axis (SPACE_PLAN_KEYS above, kept resolvable for legacy rows) with a typed
// catalog the sync (pricing-products.ts) walks and the checkout (space-plan-checkout.ts) resolves.
//
// THE SHAPE (owner strategy, 2026-06-30):
//   * Every item ships a LIST amount (the visible anchor, e.g. Pro $29) and a lower FOUNDING amount
//     (the real price today, e.g. Pro $19). The founding price is what checkout charges; the list
//     price is the anchor the surface shows it beneath.
//   * Every item ships a MONTHLY and a YEARLY Stripe price. Yearly = TWO MONTHS FREE = 10x monthly
//     (yearlyFromMonthly below is the single source of that math).
//   * Pro = a BASE item plus the four ADD-ON items (marketing / ai / team / branding), each its own
//     subscription item so it can toggle on/off independently. Nonprofit + Organization are their own
//     items; nonprofit is a per-SEAT (quantity) item.
//
// The price-row KEY namespace is `<item>_<interval>` (interval month|year), e.g. pro_base_month,
// addon_marketing_year, nonprofit_seat_month, organization_year. Each KEY resolves to a synced Stripe
// price id in pricing_stripe_prices; the founding KEY is the one CHARGED, and the LIST anchor is synced
// under `<item>_<interval>_list` so the surface can read the anchor amount/id from one source.

/** A subscription billing interval (Stripe's own vocabulary; distinct from the legacy BillingPeriod
 *  monthly|annual used by the member-tier key axis). PURE. */
export type BillingInterval = 'month' | 'year'

export const BILLING_INTERVALS: readonly BillingInterval[] = ['month', 'year']

/** The Phase B catalog item keys: the Pro base, the four add-ons, the nonprofit licensed seat, and the
 *  organization plan. Each is one Stripe Product with list + founding x month + year prices. */
export const CATALOG_ITEM_KEYS = [
  'pro_base',
  'addon_marketing',
  'addon_ai',
  'addon_team',
  'addon_branding',
  'nonprofit_seat',
  'organization',
] as const

export type CatalogItemKey = (typeof CATALOG_ITEM_KEYS)[number]

/** Narrow an arbitrary value to a known catalog item key, or null (default-deny). PURE. */
export function asCatalogItemKey(raw: string | null | undefined): CatalogItemKey | null {
  return (CATALOG_ITEM_KEYS as readonly string[]).includes(raw ?? '') ? (raw as CatalogItemKey) : null
}

/** A catalog item's per-interval amounts. `listCents` is the visible anchor; `foundingCents` is the
 *  real price charged today (the grandfathered rate). */
export interface CatalogAmounts {
  listCents: number
  foundingCents: number
}

/** A full catalog item: its label, whether it is a per-seat (quantity) item, and the month + year
 *  amount grids. PURE data. */
export interface CatalogItem {
  key: CatalogItemKey
  label: string
  /** True for items billed per licensed seat (Team, Nonprofit seat): checkout sets a quantity. */
  perSeat: boolean
  /** The month amounts (list anchor + founding charged). */
  month: CatalogAmounts
  /** The year amounts, two months free (10x monthly). */
  year: CatalogAmounts
}

/** Yearly amount from a monthly one: TWO MONTHS FREE (10x monthly), the single source of the annual
 *  math (PRICING-LADDER-PLAN §1a). PURE. Floors to whole cents (monthly amounts are whole cents, so
 *  10x is exact, but the floor keeps it robust to any future fractional input). */
export function yearlyFromMonthly(monthlyCents: number): number {
  if (!Number.isFinite(monthlyCents) || monthlyCents <= 0) return 0
  return Math.floor(monthlyCents * 10)
}

/** Build a CatalogItem's month + year grids from a monthly list + monthly founding amount, deriving
 *  both yearly amounts as two months free. PURE. */
function amountsFromMonthly(listMonthlyCents: number, foundingMonthlyCents: number): {
  month: CatalogAmounts
  year: CatalogAmounts
} {
  return {
    month: { listCents: listMonthlyCents, foundingCents: foundingMonthlyCents },
    year: {
      listCents: yearlyFromMonthly(listMonthlyCents),
      foundingCents: yearlyFromMonthly(foundingMonthlyCents),
    },
  }
}

// The CLEAN catalog (ADR-460). Monthly LIST + FOUNDING amounts from the owner-approved ladder
// (PRICING-LADDER-PLAN §1: Pro $29 list / $19 founding; add-ons Marketing/AI +$20, Team +$9/seat,
// Branding +$30; Nonprofit $15/$12 per licensed seat; Organization $249 list / $199 founding). Yearly
// derives as two months free. Add-ons carry the same list + founding when no separate anchor was
// published (founding == list reads flat today; the field still exists so a future anchor is a
// one-line edit, never a schema change).
const CATALOG: Record<CatalogItemKey, CatalogItem> = {
  pro_base: {
    key: 'pro_base',
    label: 'Frequency Pro',
    perSeat: false,
    ...amountsFromMonthly(2900, 1900), // $29 list / $19 founding
  },
  addon_marketing: {
    key: 'addon_marketing',
    label: 'Frequency Pro add-on: Marketing',
    perSeat: false,
    ...amountsFromMonthly(2000, 2000), // +$20 (no separate anchor today)
  },
  addon_ai: {
    key: 'addon_ai',
    label: 'Frequency Pro add-on: AI Engine',
    perSeat: false,
    ...amountsFromMonthly(2000, 2000), // +$20
  },
  addon_team: {
    key: 'addon_team',
    label: 'Frequency Pro add-on: Team seat',
    perSeat: true,
    ...amountsFromMonthly(900, 900), // +$9 / seat
  },
  addon_branding: {
    key: 'addon_branding',
    label: 'Frequency Pro add-on: Branding',
    perSeat: false,
    ...amountsFromMonthly(3000, 3000), // +$30
  },
  nonprofit_seat: {
    key: 'nonprofit_seat',
    label: 'Frequency Nonprofit (licensed seat)',
    perSeat: true,
    ...amountsFromMonthly(1500, 1200), // $15 list / $12 founding per seat
  },
  organization: {
    key: 'organization',
    label: 'Frequency Organization',
    perSeat: false,
    ...amountsFromMonthly(24900, 19900), // $249 list / $199 founding (floor anchor)
  },
}

/** Read a catalog item by key (PURE). Returns the typed item for a known key. */
export function catalogItem(key: CatalogItemKey): CatalogItem {
  return CATALOG[key]
}

/** The whole catalog as an ordered array (PURE), the list the sync walks. */
export function catalogItems(): readonly CatalogItem[] {
  return CATALOG_ITEM_KEYS.map((k) => CATALOG[k])
}

/** The amounts grid for an item + interval (PURE). */
export function catalogAmounts(key: CatalogItemKey, interval: BillingInterval): CatalogAmounts {
  const item = CATALOG[key]
  return interval === 'month' ? item.month : item.year
}

/** The `pricing_stripe_prices` key for a catalog item + interval, optionally the LIST-anchor variant.
 *  PURE. The FOUNDING price (the one charged) is the plain key `<item>_<interval>`; the list anchor is
 *  synced under `<item>_<interval>_list` so the surface can resolve the anchor amount/id without a
 *  second source. E.g. catalogPriceKey('pro_base','month') = 'pro_base_month';
 *  catalogPriceKey('pro_base','month',true) = 'pro_base_month_list'. */
export function catalogPriceKey(key: CatalogItemKey, interval: BillingInterval, list = false): string {
  return `${key}_${interval}${list ? '_list' : ''}`
}

/** Every catalog price-row key the sync produces: for each item, both intervals, both the founding
 *  (charged) and list (anchor) variants. PURE. */
export function allCatalogPriceKeys(): string[] {
  const keys: string[] = []
  for (const key of CATALOG_ITEM_KEYS) {
    for (const interval of BILLING_INTERVALS) {
      keys.push(catalogPriceKey(key, interval, false)) // founding (charged)
      keys.push(catalogPriceKey(key, interval, true)) // list (anchor)
    }
  }
  return keys
}

// ── Add-on item key -> entitlement add-on key bridge (ADR-460) ───────────────────────────────────
// The webhook maps each subscription item's catalog item key to the ENTITLEMENT add-on key the
// resolver consumes (lib/pricing/plans.ts AddonKey). Base/seat/org are PLAN-level (no add-on key); the
// four addon_* items each map to their AddonKey.

/** The entitlement add-on key (marketing|ai|team|branding) a catalog item maps to, or null for
 *  plan-level items (pro_base, nonprofit_seat, organization). PURE. The string is an AddonKey from
 *  lib/pricing/plans.ts (kept loose here to avoid a circular import; callers narrow with asAddonKey). */
export function addonKeyForCatalogItem(key: CatalogItemKey): 'marketing' | 'ai' | 'team' | 'branding' | null {
  switch (key) {
    case 'addon_marketing':
      return 'marketing'
    case 'addon_ai':
      return 'ai'
    case 'addon_team':
      return 'team'
    case 'addon_branding':
      return 'branding'
    default:
      return null
  }
}

// ── RETIRED legacy catalog keys (kept resolvable for legacy rows · ADR-460) ───────────────────────
// The Phase A collapse retired practitioner / business / whitelabel / supporter as sold tiers. Their
// legacy price KEYS (practitioner_monthly, business_annual, whitelabel_monthly, supporter_*) are NOT
// deleted: a legacy `pricing_stripe_prices` row + a member already locked to one of those price ids
// must still RESOLVE. The sync no longer CREATES them (they are absent from CATALOG_ITEM_KEYS), but it
// ARCHIVES (never deletes) the rows, and loadStripePriceMap still returns them so resolveStripePriceId
// works for a grandfathered row.

/** The legacy catalog price keys that are RETIRED (no longer synced) but kept resolvable for legacy
 *  rows + locked price ids. PURE. Used by the sync to ARCHIVE (not delete) the rows it no longer
 *  refreshes. */
export const RETIRED_CATALOG_KEYS: readonly string[] = (() => {
  const retiredBases: readonly SpacePlanKey[] = ['practitioner', 'business', 'whitelabel']
  const keys: string[] = []
  for (const base of retiredBases) {
    for (const period of PERIODS_BY_KEY[base]) {
      keys.push(priceKey(base, period))
      keys.push(priceKey(base, period, true))
    }
  }
  // Supporter is retired as a sold tier (becomes a PWYW badge), so its catalog keys retire too.
  for (const period of PERIODS_BY_KEY.supporter) {
    keys.push(priceKey('supporter', period))
    keys.push(priceKey('supporter', period, true))
  }
  return keys
})()
