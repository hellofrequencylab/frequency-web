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

// Price-catalog labels (ADR-552). The paid space ladder is Business + Non Profit, keyed to the
// pricing_settings.plan VALUE shape. Plain voice, no em dashes.
const PRICE_CATALOG_LABEL: Record<string, string> = {
  business: 'Business',
  nonprofit: 'Non Profit',
}

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

/** The PAID space plans as display rows, in ladder order (Business, Non Profit). PURE (ADR-552).
 *  'free' is the baseline and is rendered by the caller, not part of the paid ladder here. Non Profit is
 *  the $29 verified-501c3 sibling of Business (same depth, discounted). */
export function spacePlanRows(values: PricingDefaults): PriceRow[] {
  const labelFor = (p: string): string => PRICE_CATALOG_LABEL[p] ?? p
  return [
    priceRow('business', labelFor('business'), values.plan.business),
    priceRow('nonprofit', labelFor('nonprofit'), values.plan.nonprofit),
  ]
}
