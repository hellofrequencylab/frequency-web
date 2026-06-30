// PRICING DISPLAY — the PURE shaping of the operator-editable pricing VALUES (cents, periods) into
// the rows the member-upgrade + space-plan UIs render (Pricing P3, ADR-362/363). No Supabase/Next/
// Stripe here, so it is trivially unit-testable; the IO (getPricingValues) lives at the call site
// and is handed in. The point: the surfaces show what the operator set at /admin/pricing, never a
// hardcoded price, and the "is this sellable right now" decision is layered ON TOP by the caller via
// billingLive() + the per-tier/plan switch (everything ships OFF, so OFF renders a tasteful disabled
// "coming soon" CTA, never a broken button).
//
// Voice: plain, no em dashes (CONTENT-VOICE §10). Labels come from the naming canon (Crew, Supporter,
// Practitioner, Business, Organization, White-label).

import type { PricingDefaults, TierPrice } from './settings'

// LEGACY price-catalog labels (ADR-458). This P3 price ladder still renders the legacy plan rows
// (practitioner/business/nonprofit/organization/whitelabel) keyed to the pricing_settings.plan VALUE
// shape, which Phase C / F rewrites into the commercial Pro + add-ons surface. It is deliberately
// decoupled from the new SPACE_PLAN_LABEL (free/pro/nonprofit/organization) so Phase A can collapse
// the plan model without churning the existing display rows. Plain voice, no em dashes.
const PRICE_CATALOG_LABEL: Record<string, string> = {
  practitioner: 'Practitioner',
  business: 'Business',
  nonprofit: 'Nonprofit',
  organization: 'Organization',
  whitelabel: 'White-label',
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
  /** One-time setup price label (white-label only), or null. */
  setup: string | null
  /** Raw cents, for callers that need to compute (e.g. annual savings). */
  monthlyCents: number
  annualCents: number | null
  setupCents: number | null
}

/** Build a display row from a raw TierPrice + its key/label. PURE. */
export function priceRow(key: string, label: string, price: TierPrice): PriceRow {
  return {
    key,
    label,
    monthly: formatCents(price.monthly_cents),
    annual: price.annual_cents != null ? formatCents(price.annual_cents) : null,
    setup: price.setup_cents != null ? formatCents(price.setup_cents) : null,
    monthlyCents: price.monthly_cents,
    annualCents: price.annual_cents ?? null,
    setupCents: price.setup_cents ?? null,
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

/** The PAID space plans as display rows, in ladder order (practitioner -> white-label). PURE.
 *  'free' is the baseline and is rendered by the caller, not part of the paid ladder here.
 *
 *  Nonprofit (the $29 verified-501c3 plan) rides between business and organization: it is the plan
 *  built FOR a Space of type `organization` (a nonprofit), so an organization owner has to be able
 *  to FIND it on their own billing ladder. The 'organization' row above it is the high-end custom
 *  plan (built, not publicly sold) for large orgs; the two read as a clear ladder once both show. */
export function spacePlanRows(values: PricingDefaults): PriceRow[] {
  const labelFor = (p: string): string => PRICE_CATALOG_LABEL[p] ?? p
  return [
    priceRow('practitioner', labelFor('practitioner'), values.plan.practitioner),
    priceRow('business', labelFor('business'), values.plan.business),
    priceRow('nonprofit', labelFor('nonprofit'), values.plan.nonprofit),
    priceRow('organization', labelFor('organization'), values.plan.organization),
    priceRow('whitelabel', labelFor('whitelabel'), values.plan.whitelabel),
  ]
}
