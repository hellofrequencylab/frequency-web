// PRICING DISPLAY — the PURE shaping of the operator-editable pricing VALUES (cents, periods) into
// the rows the member-upgrade + space-plan UIs render (Pricing P3, ADR-362/363). No Supabase/Next/
// Stripe here, so it is trivially unit-testable; the IO (getPricingValues) lives at the call site
// and is handed in. The point: the surfaces show what the operator set at /admin/pricing, never a
// hardcoded price, and the "is this sellable right now" decision is layered ON TOP by the caller via
// billingLive() + the per-tier/plan switch (everything ships OFF, so OFF renders a tasteful disabled
// "coming soon" CTA, never a broken button).
//
// Voice: plain, no em dashes (CONTENT-VOICE §10). Labels come from the naming canon (Crew, Supporter,
// Business, Non Profit).

import type { PricingDefaults, TierPrice } from './settings'
import { SPACE_PLAN_LABEL, type SpacePlan } from './plans'

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

/** The two member tiers (Crew, Supporter) as display rows, in ladder order. PURE — pass the resolved
 *  pricing values (getPricingValues()). */
export function memberTierRows(values: PricingDefaults): PriceRow[] {
  return [
    priceRow('crew', 'Crew', values.tier.crew),
    priceRow('supporter', 'Supporter', values.tier.supporter),
  ]
}

/** The PAID space plans as display rows, in ladder order: Business, Collective, Non Profit, Independent
 *  (ADR-811). PURE. 'free' is the baseline and is rendered by the caller, not part of the paid ladder
 *  here. Labels come from the naming canon (SPACE_PLAN_LABEL), so a rename lands in one place.
 *
 *  Whether a row shows a crossed-out anchor is DERIVED from its own values (priceRow: an anchor reads
 *  only when `list_cents` is strictly above `monthly_cents`), so Business and Collective render their
 *  beta rate under a list while Non Profit and Independent render a single price. No tier can claim a
 *  discount the config does not carry. */
export function spacePlanRows(values: PricingDefaults): PriceRow[] {
  return PAID_SPACE_PLANS.map((plan) => priceRow(plan, SPACE_PLAN_LABEL[plan], values.plan[plan]))
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
