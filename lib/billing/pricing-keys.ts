// PRICING KEYS — the pure mapping between (tier|plan, billing period, founder?) and the
// `pricing_stripe_prices` row key, plus the catalog of which keys exist (Pricing P2, ADR-363).
// PURE + framework-independent (no Stripe/Supabase/Next), like lib/billing/fees.ts, so the
// key resolution + founder-lock selection are trivially unit-testable.
//
// A key is `<tier|plan>_<period>` with an optional `_founder` suffix for the founder-locked
// variant. The founder variant is stored archived (not offered publicly) but referenced by a
// founding member's profiles.locked_price_id at checkout.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { type SpacePlan, asSpacePlan } from '@/lib/pricing/plans'

/** A subscription billing period. */
export type BillingPeriod = 'monthly' | 'annual'

/** The member (personal) tiers that are sold (free is never a paid key). */
export const MEMBER_TIER_KEYS = ['crew', 'supporter'] as const
export type MemberTierKey = (typeof MEMBER_TIER_KEYS)[number]

/** The space-plan price-catalog keys that are SOLD self-serve (ADR-552). Collapsed to Business +
 *  Nonprofit: the two first-class paid tiers. The retired names (practitioner/organization/whitelabel)
 *  are no longer here; their legacy price keys stay resolvable via RETIRED_CATALOG_KEYS. Partner is
 *  comped, so it is intentionally not here. */
export const SPACE_PLAN_KEYS = ['business', 'nonprofit'] as const
export type SpacePlanKey = (typeof SPACE_PLAN_KEYS)[number]

/** Which billing periods each tier/plan offers. Business + Nonprofit both offer monthly + annual. The
 *  source of truth for "is there an annual price?". */
export const PERIODS_BY_KEY: Record<MemberTierKey | SpacePlanKey, readonly BillingPeriod[]> = {
  crew: ['monthly', 'annual'],
  supporter: ['monthly', 'annual'],
  business: ['monthly', 'annual'],
  nonprofit: ['monthly', 'annual'],
}

/** Does this tier/plan offer the given billing period? (Business + Nonprofit offer both.) */
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

/** The take-rate basis points in pricing_settings.take_rate for a space, keyed on PAYING-STATE, not the
 *  plan label (ADR-552). In the collapsed model a free space and a paying Business can BOTH carry
 *  spaces.plan = 'business' (free-vs-paid is a usage state within Business), so the rate cannot key on
 *  the label alone: it turns on whether the space has a LIVE paid subscription (`isPaying`). PURE.
 *
 *   - Non Profit → nonprofit_bps (a verified-501c3 plan is inherently paid).
 *   - Business → business_bps when paying (a live subscription item), else the higher free_bps.
 *   - free / legacy / unknown plan → free_bps (the higher rate). Never under-collect: an un-resolved or
 *     not-paying space pays the HIGHER free rate, so a misconfiguration over-collects, never charges 0%. */
export function takeRateBpsForPlan(
  plan: SpacePlan | string | null | undefined,
  takeRate: { free_bps: number; business_bps: number; nonprofit_bps: number },
  isPaying = false,
): number {
  switch (asSpacePlanKey(plan)) {
    case 'nonprofit':
      return takeRate.nonprofit_bps
    case 'business':
      // A Business pays the lower rate only with a live paid subscription; a free Business pays free_bps.
      return isPaying ? takeRate.business_bps : takeRate.free_bps
    default:
      // free / legacy / unknown plan: no live paid subscription → the higher free rate (never
      // under-collect; the free rate is now the HIGHER of the two).
      return takeRate.free_bps
  }
}

/** The application-fee cents on a gross charge for a space's take-rate, by paying-state. PURE (no I/O).
 *  Floors fractional cents so the recipient is never short-changed (mirrors platformFeeCents). */
export function takeRateCents(
  grossCents: number,
  plan: SpacePlan | string | null | undefined,
  takeRate: { free_bps: number; business_bps: number; nonprofit_bps: number },
  isPaying = false,
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  const bps = takeRateBpsForPlan(plan, takeRate, isPaying)
  return Math.floor((grossCents * bps) / 10000)
}

/** The take-rate bps for an individual PAID-MEMBER seller (owner_kind='profile') — the Market listing
 *  ladder rate (8% today, ADR-596). Distinct from the space plan rates: a member sells at member_bps,
 *  and upgrading their space to Business buys the fee down to business_bps. PURE. Fails safe to the
 *  higher free_bps if a legacy row lacks member_bps (never under-collect). */
export function memberTakeRateBps(takeRate: { member_bps?: number; free_bps: number }): number {
  return typeof takeRate.member_bps === 'number' ? takeRate.member_bps : takeRate.free_bps
}

/** The application-fee cents on a gross charge for an individual paid-member seller. PURE (no I/O).
 *  Floors fractional cents so the recipient is never short-changed (mirrors takeRateCents). */
export function memberTakeRateCents(
  grossCents: number,
  takeRate: { member_bps?: number; free_bps: number },
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.floor((grossCents * memberTakeRateBps(takeRate)) / 10000)
}

// ── The DIFFERENTIAL (network-sourced) take-rate (Phase 2, ADR-811 §A) ───────────────────────────────
// The Community Collective principle: we NEVER take a cut of the business a member brings themselves
// (`self` orders = 0%, always, the hard promise), and we take a small, tier-declining cut ONLY of the
// business the NETWORK sourced (referral / discovery / marketplace). The rate drops as the tier rises,
// so a paid plan visibly buys down the fee. All PURE; the IO wrappers (lib/billing/fees.ts) resolve the
// operator-set rates and thread the classified `source`.

/** An order's commercial source: the operator's OWN booking (0% fee, always) vs a sale the NETWORK
 *  sourced (referral / discovery / marketplace). PURE. */
export type OrderSource = 'self' | 'network'

/** NETWORK-sourced take-rate (bps) per SPACE plan tier (ADR-811 §4). `self` orders are 0 by rule, so this
 *  vector holds only the network side. The rate DROPS as the tier rises; a disconnected Independent space
 *  has left the graph, so its network revenue is 0 by definition. `member` = the individual paid-member
 *  (profile) seller rate (the Crew rate). */
export interface NetworkTakeRate {
  free: number
  business: number
  collective: number
  nonprofit: number
  independent: number
  member: number
}

/** The seeded default network take-rate: Member/free 1000 (10%) · Business 500 · Collective 300 ·
 *  Non Profit 0 · Independent 0 · individual member seller 800. Launch low; earn the right to raise. */
export const NETWORK_TAKE_RATE_DEFAULT: NetworkTakeRate = {
  free: 1000,
  business: 500,
  collective: 300,
  nonprofit: 0,
  independent: 0,
  member: 800,
}

/** The network-sourced take-rate bps for a space plan. `self` is 0 by rule and never reaches here. An
 *  unknown / legacy label narrows through asSpacePlan (default-deny to 'free', the HIGHER rate — never
 *  under-collect on a network sale). PURE. */
export function networkTakeRateBpsForPlan(
  plan: SpacePlan | string | null | undefined,
  rate: NetworkTakeRate = NETWORK_TAKE_RATE_DEFAULT,
): number {
  const p = asSpacePlan(plan) // free | business | collective | nonprofit | independent
  return rate[p]
}

/** Source-aware application-fee cents for a SPACE sale. `self` → 0 (the hard promise); `network` → the
 *  tier's network bps. PURE (no I/O). Floors fractional cents so the recipient is never short. */
export function sourceAwareTakeRateCents(
  grossCents: number,
  plan: SpacePlan | string | null | undefined,
  source: OrderSource,
  rate: NetworkTakeRate = NETWORK_TAKE_RATE_DEFAULT,
): number {
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.floor((grossCents * networkTakeRateBpsForPlan(plan, rate)) / 10000)
}

/** Source-aware application-fee cents for an individual PAID-MEMBER (profile) seller. `self` → 0;
 *  `network` → the member (Crew) rate. PURE. Floors fractional cents. */
export function sourceAwareMemberTakeRateCents(
  grossCents: number,
  source: OrderSource,
  rate: NetworkTakeRate = NETWORK_TAKE_RATE_DEFAULT,
): number {
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.floor((grossCents * rate.member) / 10000)
}

/** The monthly take-rate saving (cents) a not-yet-paying space would get on paid Business: the bps
 *  delta (free rate minus the paid Business rate) applied to its trailing monthly processed volume.
 *  PURE (ADR-552, the self-funding trigger). Returns 0 when the delta or the volume is non-positive, so
 *  the "you'd have saved $X" nudge only ever shows a real, positive saving. Floors to whole cents. */
export function monthlyTakeRateSavingsCents(
  trailingVolumeCents: number,
  takeRate: { free_bps: number; business_bps: number },
): number {
  if (!Number.isFinite(trailingVolumeCents) || trailingVolumeCents <= 0) return 0
  const deltaBps = takeRate.free_bps - takeRate.business_bps
  if (deltaBps <= 0) return 0
  return Math.floor((trailingVolumeCents * deltaBps) / 10000)
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

// ── The CLEAN Stripe catalog (ADR-460; re-tiered ADR-472, docs/PRICING-LADDER-PLAN.md §1a/§1b/§4/§5) ──
// The tier ladder (free / pro / business / nonprofit / organization) is sold as a set of CATALOG ITEMS,
// one Stripe Product each, each carrying FOUR prices: { list, founding } x { month, year }. This is the
// typed catalog the sync (pricing-products.ts) walks and the checkout (space-plan-checkout.ts) resolves.
//
// THE SHAPE (owner strategy, 2026-06-30; re-tiered 2026-06-30 ADR-472):
//   * Every item ships a LIST amount (the visible anchor, e.g. Pro $29) and a lower FOUNDING amount
//     (the real price today, e.g. Pro $19). The founding price is what checkout charges; the list
//     price is the anchor the surface shows it beneath.
//   * Every item ships a MONTHLY and a YEARLY Stripe price. Yearly = TWO MONTHS FREE = 10x monthly
//     (yearlyFromMonthly below is the single source of that math).
//   * The four old Pro add-ons (Marketing / Team / Branding) FOLD INTO TIER DEPTH (ADR-472): a Space
//     buys a TIER (Pro base or Business base), not those add-ons. The Business base is the full-depth
//     team tier. AI Engine is the SOLE remaining metered add-on item (addon_ai), toggled independently
//     on any paid tier. Nonprofit is a FLAT $29/mo item (ADR-590), not per-seat; Organization is its own item.
//   * TODO(ADR-472 surfaces): the marketing/team/branding add-on CATALOG items + their per-seat Team
//     handling are RETIRED here (see RETIRED_CATALOG_KEYS). The loadout-picker / persona / pricing-page
//     surfaces that still reference them are kept compiling but get their real rebuild in the surface PR.
//
// The price-row KEY namespace is `<item>_<interval>` (interval month|year), e.g. pro_base_month,
// business_base_year, addon_ai_month, nonprofit_seat_month, organization_year. Each KEY resolves to a
// synced Stripe price id in pricing_stripe_prices; the founding KEY is the one CHARGED, and the LIST
// anchor is synced under `<item>_<interval>_list` so the surface reads the anchor amount/id from one
// source.

/** A subscription billing interval (Stripe's own vocabulary; distinct from the legacy BillingPeriod
 *  monthly|annual used by the member-tier key axis). PURE. */
export type BillingInterval = 'month' | 'year'

export const BILLING_INTERVALS: readonly BillingInterval[] = ['month', 'year']

/** The catalog item keys (ADR-552): the Business base (full-depth paid tier), the sole metered AI add-on,
 *  and the nonprofit licensed seat. Each is one Stripe Product with list + founding x month + year prices.
 *  The former Pro base, Organization plan, and marketing/team/branding add-on items are RETIRED (folded
 *  into the Business tier); see RETIRED_CATALOG_KEYS. */
export const CATALOG_ITEM_KEYS = [
  'business_base',
  'collective_base',
  'independent_base',
  'addon_ai',
  'nonprofit_seat',
  'operator_seat',
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
  /** PLACEHOLDER: the amounts here are a stand-in the owner has not set yet. The catalog SYNC SKIPS a
   *  placeholder item — no Stripe product/price is minted — so `resolveLoadoutPriceId` stays null and the
   *  item is genuinely inert (never charged). To go live: set the real amount, remove this flag, re-sync. */
  placeholder?: boolean
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

// The CLEAN catalog (ADR-460; Community Collective repricing ADR-811). Monthly amounts: Business $29/mo
// (run-your-practice depth); the Resonance Engine add-on +$20/mo (optional on any paid plan); Non Profit
// $39/mo FLAT (the full Collective toolkit, for verified 501(c)(3)s, donations built in). NEVER per seat.
// Collective ($79 list / $49 beta) + Independent ($249 flat) are sellable catalog bases (ADR-811 go-live).
// The $19/$49 beta anchors auto-revert to list on 2026-09-01 (lib/pricing/beta.ts) via a checkout key
// switch. Yearly derives as two months free. An item carries the same list + founding when no separate
// anchor is published (founding == list reads flat today; the field still exists so a future anchor is a
// one-line edit, never a schema change). The marketing/team/branding add-on items are RETIRED (their
// depth folds into the Business base, ADR-472); only addon_ai (the Resonance Engine) remains as an add-on.
const CATALOG: Record<CatalogItemKey, CatalogItem> = {
  business_base: {
    key: 'business_base',
    label: 'Frequency Business',
    perSeat: false,
    // Business is the run-your-practice base (ADR-811): CRM, email, reporting, your own website. Automation,
    // team roles, multi-pipeline, and collaborators live at COLLECTIVE; white-label at INDEPENDENT.
    // FOUNDING ladder (owner, 2026-07-24): $19 founding under the $29 list. This makes the founding+list
    // spread a clean progression: $19 -> $29 -> $49 -> $79 (Business founding/list, Collective founding/list),
    // with +$10/+$20/+$30 gaps. Yearly derives as two months free ($190 founding / $290 list).
    // Per-seat Team billing rides this tier's seat machinery, not a separate add-on item.
    ...amountsFromMonthly(2900, 1900), // list $29, founding $19 (ADR-811 Community Collective)
  },
  addon_ai: {
    key: 'addon_ai',
    // The Resonance Engine: turns the community's signals into live matches + next-best actions. The
    // internal key stays `addon_ai` (an identifier; renaming it buys only grandfather/webhook churn) —
    // only the label is user-facing (ADR-590).
    label: 'Frequency Resonance Engine (add-on)',
    perSeat: false,
    ...amountsFromMonthly(2000, 2000), // +$20, the sole cross-tier optional add-on (ADR-552/590)
  },
  collective_base: {
    // Collective (ADR-811): everything in Business plus automations, team roles, multiple pipelines, and
    // hosting collaborators. FOUNDING beta: $49/mo under the $79 list ($490 / $790 yearly, two months free).
    key: 'collective_base',
    label: 'Frequency Collective',
    perSeat: false,
    ...amountsFromMonthly(7900, 4900), // list $79, founding (beta) $49
  },
  independent_base: {
    // Independent (ADR-811): everything in Collective plus your own brand + custom domain, standalone and
    // OFF the network (standard SaaS pricing, no network take-rate). No founding discount (founding == list).
    key: 'independent_base',
    label: 'Frequency Independent',
    perSeat: false,
    ...amountsFromMonthly(24900, 24900), // $249/mo flat, standalone white-label
  },
  nonprofit_seat: {
    // FLAT nonprofit (ADR-590): $29/mo, never per seat. The internal key stays `nonprofit_seat` (a legacy
    // identifier; the DB item_key + retired-key plumbing key off it) but the plan is NOT per-seat anymore
    // — perSeat:false makes the seat machinery inert for it. Verified 501(c)(3), donations built in.
    key: 'nonprofit_seat',
    label: 'Frequency Non Profit',
    perSeat: false,
    ...amountsFromMonthly(3900, 3900), // $39/mo flat (ADR-811), full Collective toolkit, verified 501c3
  },
  operator_seat: {
    // OPERATOR SEATS (ADR-799): a genuine per-seat add-on. The owner's seat is free (BASE_SEAT_ALLOWANCE);
    // each ADDITIONAL operator (editor/moderator/admin) bills one seat at this flat rate, on any paid plan.
    // This is a SEPARATE per-seat item (perSeat:true) — distinct from the retired per-seat PLAN pricing
    // (ADR-590) and refining ADR-552's "seats ride the base tier" note per the owner's flat-add-on choice.
    // PLACEHOLDER (`placeholder:true`): the amount below is a stand-in, and the catalog sync SKIPS it, so NO
    // Stripe price is minted and resolveLoadoutPriceId stays null (the seat item is dropped from checkout).
    // This keeps it genuinely inert until the owner sets the real amount AND removes `placeholder` — so a
    // routine sync of the other items can never mint a live seat price the owner did not approve.
    key: 'operator_seat',
    label: 'Operator seat',
    perSeat: true,
    placeholder: true,
    ...amountsFromMonthly(900, 900), // PLACEHOLDER $9/seat/mo — owner sets the final amount, then drops the flag
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

// ── Add-on item key -> entitlement add-on key bridge (ADR-460; re-tiered ADR-472) ─────────────────
// The webhook maps each subscription item's catalog item key to the ENTITLEMENT add-on key the
// resolver consumes (lib/pricing/plans.ts AddonKey). Base/seat/org are TIER-level (no add-on key); the
// sole metered add-on item (addon_ai) maps to the only AddonKey, 'ai'.

/** The entitlement add-on key ('ai') a catalog item maps to, or null for tier-level items (pro_base,
 *  business_base, nonprofit_seat, organization). PURE. The string is an AddonKey from
 *  lib/pricing/plans.ts (kept loose here to avoid a circular import; callers narrow with asAddonKey). */
export function addonKeyForCatalogItem(key: CatalogItemKey): 'ai' | null {
  return key === 'addon_ai' ? 'ai' : null
}

// ── RETIRED legacy catalog keys (kept resolvable for legacy rows · ADR-460/472; collapsed ADR-552) ─
// Every retired key is kept RESOLVABLE (never deleted) so a legacy `pricing_stripe_prices` row + a member
// already locked to one of those price ids still RESOLVE:
//   1. The pre-ladder per-plan tiers (practitioner / organization / whitelabel / supporter) on the legacy
//      KEY axis (practitioner_monthly, organization_monthly, whitelabel_monthly, supporter_*).
//   2. The retired CATALOG items whose depth folded into the Business tier (ADR-552): the former Pro base
//      and Organization plan, plus the ADR-472 Marketing / Team / Branding add-on items
//      (pro_base_*, organization_*, addon_marketing_*, addon_team_*, addon_branding_* on the catalog KEY
//      axis, both founding + _list variants).
// The sync no longer CREATES any of these (they are absent from CATALOG_ITEM_KEYS / SPACE_PLAN_KEYS), but
// it ARCHIVES (never deletes) the rows, and loadStripePriceMap still returns them so resolveStripePriceId
// works for a grandfathered row.

/** The retired add-on catalog ITEM keys (ADR-472): Marketing / Team / Branding, folded into the
 *  Business tier depth. Kept resolvable for any legacy subscription row; never synced. */
export const RETIRED_ADDON_ITEM_KEYS: readonly string[] = ['addon_marketing', 'addon_team', 'addon_branding']

/** The retired CATALOG item keys on the catalog price-key axis (ADR-552): the former Pro base and
 *  Organization plan (folded into Business), plus the ADR-472 add-on items. Kept resolvable; never synced. */
const RETIRED_CATALOG_ITEM_KEYS: readonly string[] = ['pro_base', 'organization', ...RETIRED_ADDON_ITEM_KEYS]

/** The retired LEGACY per-plan bases + the periods they offered (ADR-552): practitioner had monthly +
 *  annual; organization + whitelabel were monthly-only. Kept resolvable on the `<plan>_<period>` axis. */
const RETIRED_LEGACY_PLAN_PERIODS: Record<string, readonly BillingPeriod[]> = {
  practitioner: ['monthly', 'annual'],
  organization: ['monthly'],
  whitelabel: ['monthly'],
}

/** The legacy catalog price keys that are RETIRED (no longer synced) but kept resolvable for legacy
 *  rows + locked price ids. PURE. Used by the sync to ARCHIVE (not delete) the rows it no longer
 *  refreshes. */
export const RETIRED_CATALOG_KEYS: readonly string[] = (() => {
  const keys: string[] = []
  // The retired legacy per-plan price keys (`<plan>_<period>` + founder variant).
  for (const [base, periods] of Object.entries(RETIRED_LEGACY_PLAN_PERIODS)) {
    for (const period of periods) {
      keys.push(`${base}_${period}`)
      keys.push(`${base}_${period}_founder`)
    }
  }
  // Supporter is retired as a sold tier (becomes a PWYW badge), so its catalog keys retire too.
  for (const period of PERIODS_BY_KEY.supporter) {
    keys.push(priceKey('supporter', period))
    keys.push(priceKey('supporter', period, true))
  }
  // The retired CATALOG items (Pro base, Organization, and the Marketing/Team/Branding add-ons), both
  // intervals + both the founding and the _list anchor variant (matching catalogPriceKey's namespace).
  for (const item of RETIRED_CATALOG_ITEM_KEYS) {
    for (const interval of BILLING_INTERVALS) {
      keys.push(`${item}_${interval}`)
      keys.push(`${item}_${interval}_list`)
    }
  }
  return keys
})()
