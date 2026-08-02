// PRICING DISPLAY — the PURE shaping of the operator-editable pricing VALUES (cents, periods) into
// the rows the member-upgrade + space-plan UIs render (Pricing P3, ADR-362/363). No Supabase/Next/
// Stripe here, so it is trivially unit-testable; the IO (getPricingValues) lives at the call site
// and is handed in. The point: the surfaces show what the operator set at /admin/pricing, never a
// hardcoded price, and the "is this sellable right now" decision is layered ON TOP by the caller via
// billingLive() + the per-tier/plan switch (everything ships OFF, so OFF renders a tasteful disabled
// "coming soon" CTA, never a broken button).
//
// Voice: plain, no em dashes (CONTENT-VOICE §10). Labels come from the naming canon (Crew, Business,
// Non Profit).

import type { PricingDefaults, TierPrice } from './settings'
import { SPACE_PLAN_LABEL, type SpacePlan } from './plans'
import { yearlyFromMonthly } from '@/lib/billing/pricing-keys'

/** The PAID space plans, in ladder order (ADR-811). `free` is the baseline, not a paid row. Keyed to
 *  the `pricing_settings.plan.*` VALUE shape, so every sellable Space tier has a display row. */
export const PAID_SPACE_PLANS: readonly Exclude<SpacePlan, 'free'>[] = [
  'business',
  'collective',
  'nonprofit',
  'independent',
]

/** Cents to a plain price label, e.g. 900 -> "$9", 950 -> "$9.50". Whole dollars drop the cents.
 *  USD only (mirrors the membership join card). PURE. */
export function formatCents(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** One row in a price ladder the UI maps over (a member tier or a space plan). */
export interface PriceRow {
  /** The stable key for this row (the tier/plan name: 'crew' | 'practitioner' | ...). */
  key: string
  /** The naming-canon label (Crew, Practitioner, White-label, ...). */
  label: string
  /** Monthly price label, e.g. "$9". */
  monthly: string
  /** Annual price label, or null when the row is monthly-only. */
  annual: string | null
  /** The MONTHLY list-anchor label (ADR-463), e.g. "$12", or null when there is no anchor. The monthly
   *  price is the founding price the anchor sits under. */
  list: string | null
  /** Raw cents, for callers that need to compute (e.g. annual savings). */
  monthlyCents: number
  annualCents: number | null
  listCents: number | null
}

/** Build a display row from a raw TierPrice + its key/label. PURE. */
export function priceRow(key: string, label: string, price: TierPrice): PriceRow {
  // The list anchor only reads when it is strictly above the founding (monthly) price; an absent or
  // equal/lower anchor renders as no anchor (the monthly is shown plainly).
  const hasAnchor = price.list_cents != null && price.list_cents > price.monthly_cents
  return {
    key,
    label,
    monthly: formatCents(price.monthly_cents),
    annual: price.annual_cents != null ? formatCents(price.annual_cents) : null,
    list: hasAnchor ? formatCents(price.list_cents as number) : null,
    monthlyCents: price.monthly_cents,
    annualCents: price.annual_cents ?? null,
    listCents: hasAnchor ? (price.list_cents as number) : null,
  }
}

/** The PAID member tiers as display rows, in ladder order. Today that is exactly ONE row, Crew: the
 *  member ladder is Member (free) and Crew (ADR-878), and free is the baseline, not a priced row.
 *  Supporter is not here and cannot be: it left the sellable ladder (ADR-878, after ADR-458 retired it
 *  as a tier), and `values.tier` no longer carries a Supporter price to shape. PURE — pass the resolved
 *  pricing values (getPricingValues()). */
export function memberTierRows(values: PricingDefaults): PriceRow[] {
  // 🔴 CREW IS PAY-WHAT-YOU-WANT, so its amount is a FLOOR and must read as one. Every surface that
  // renders this row was quoting it as "the price" for an offer that has none. `from` is prefixed here,
  // at the single row builder, so no caller has to remember and none can forget.
  const row = priceRow('crew', 'Crew', values.tier.crew)
  return [{ ...row, monthly: `from ${row.monthly}`, annual: row.annual ? `from ${row.annual}` : row.annual }]
}

/** The prices a surface should SHOW for a plan given the beta window (ADR-880). The display twin of
 *  lib/pricing/beta.ts effectiveCatalogAmounts, and for the same reason: the table must resolve a price
 *  the way the checkout charges it, or the page quotes a number the checkout will not take. PURE.
 *
 *  DURING the beta window the row is unchanged: the beta `monthly_cents` under its `list_cents` anchor.
 *  ON/AFTER the cutover the checkout switches to the LIST price key (space-plan-checkout.ts
 *  resolveLoadoutPriceId reads `!isBetaPricingActive()`), so the list BECOMES the price: it moves into
 *  `monthly_cents`, the anchor is dropped (nothing to cross out; we do not strike a number we now
 *  charge), and the annual re-derives from it through yearlyFromMonthly, the single source of the
 *  two-months-free math the catalog itself uses. A plan with no anchor (Non Profit, Independent) never
 *  moves. */
export function effectiveTierPrice(price: TierPrice, betaActive: boolean): TierPrice {
  if (betaActive) return price
  const list = price.list_cents
  if (list == null || list <= price.monthly_cents) return price // no beta anchor: nothing reverts
  const { list_cents: _anchor, ...rest } = price
  return {
    ...rest,
    monthly_cents: list,
    annual_cents: price.annual_cents == null ? null : yearlyFromMonthly(list),
  }
}

/** The PAID space plans as display rows, in ladder order: Business, Collective, Non Profit, Independent
 *  (ADR-811). PURE. 'free' is the baseline and is rendered by the caller, not part of the paid ladder
 *  here. Labels come from the naming canon (SPACE_PLAN_LABEL), so a rename lands in one place.
 *
 *  Whether a row shows a crossed-out anchor is DERIVED from its own values (priceRow: an anchor reads
 *  only when `list_cents` is strictly above `monthly_cents`), so Business and Collective render their
 *  beta rate under a list while Non Profit and Independent render a single price. No tier can claim a
 *  discount the config does not carry.
 *
 *  `betaActive` is REQUIRED by the caller (ADR-880), because this ladder had no clock: the anchor rule
 *  is only "list is above monthly", which stays permanently true after the cutover while the checkout
 *  has already moved to list. Pass the SAME answer the checkout asks (isBetaPricingActive()). */
export function spacePlanRows(values: PricingDefaults, betaActive: boolean): PriceRow[] {
  return PAID_SPACE_PLANS.map((plan) =>
    priceRow(plan, SPACE_PLAN_LABEL[plan], effectiveTierPrice(values.plan[plan], betaActive)),
  )
}

/** The plain yearly-billing line for the operator-set annual discount, e.g. "Yearly is two months free."
 *  PURE. Reads the months-free knob so a change to the discount reflows the sentence. */
export function annualDiscountNote(values: PricingDefaults): string {
  const months = values.annual_discount.months_free
  if (months <= 0) return 'Monthly or yearly.'
  return `Yearly is ${months === 2 ? 'two' : months === 1 ? 'one' : String(months)} month${months === 1 ? '' : 's'} free.`
}

/** The plain trial line for the operator-set trial length, e.g. "14-day free trial." Null when the
 *  operator has set no trial (never invent one). PURE. */
export function trialNote(values: PricingDefaults): string | null {
  const days = values.trial.days
  return days > 0 ? `${days}-day free trial.` : null
}

/** A take-rate in basis points as a plain percent label, e.g. 500 -> "5%", 0 -> "0%". PURE. */
export function formatBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0%'
  const pct = bps / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}
