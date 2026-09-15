// MEMBERSHIP PRICING, THE PURE HALF (ADR-1374). What a tier costs at the cadence the member picked,
// and what may honestly be claimed about the yearly price beside it.
//
// SEPARATE FROM lib/spaces/memberships.ts ON PURPOSE. That module owns the types, the normalization
// and the IO, and it imports the service-role admin client, so a CLIENT component may import types
// from it but never a value. The join card and the tier picker both need these functions at runtime,
// so they live here: no React, no Next, no Supabase, nothing but arithmetic and strings.
//
// HONESTY IS THE WHOLE POINT OF THE SAVING LINE. "Two months free" is a claim about the operator's
// two numbers, so it is computed from them and shown only when it is exactly true. A yearly price
// that saves an odd amount says the amount; one that saves nothing says nothing at all.

import { formatPriceCents } from '@/lib/commerce/types'

/** The two cadences a membership can be BILLED on. Narrower than MembershipInterval, which also
 *  carries the legacy 'once'. This is what the toggle picks and what a membership row records. */
export type BillingInterval = 'month' | 'year'

/** The price fields this module reads off a tier. Structural, so the caller can pass a
 *  MembershipTier or a plain row without importing the server module. */
export interface TierPrices {
  /** The MONTHLY price in cents (0 = free). */
  priceCents: number
  /** The optional yearly price for the SAME tier in cents; null = monthly only. */
  annualPriceCents: number | null
  /** The tier's own stored cadence. 'year' or 'once' only on a tier published before ADR-1374. */
  interval: 'month' | 'year' | 'once'
}

/** What one card shows for the selected cadence. */
export interface TierPriceView {
  /** The amount to show, in cents. */
  cents: number
  /** The cadence that amount is charged at, for the label under it. */
  cadence: 'month' | 'year' | 'once'
  /** Free tier: the toggle does not touch it. */
  free: boolean
  /** Yearly is selected and this tier has no yearly price, so the card is showing the monthly one
   *  and must say so rather than looking identical to a tier that does have one. */
  monthlyOnly: boolean
}

/** Does this tier offer a yearly price at all? A free tier never does: there is nothing to bill. */
export function hasAnnualOption(tier: TierPrices): boolean {
  return tier.priceCents > 0 && tier.annualPriceCents != null && tier.annualPriceCents > 0
}

/**
 * The price a card shows for the cadence the member picked. PURE.
 *
 * A free tier ignores the toggle. A tier with a yearly price shows it under 'year'. A tier without
 * one keeps its monthly price and reports `monthlyOnly`, so the card can say that plainly. A tier
 * published before ADR-1374 whose own `interval` is 'year' or 'once' keeps showing that cadence,
 * because its single price has always been charged that way.
 */
export function tierPriceView(tier: TierPrices, selected: BillingInterval): TierPriceView {
  if (tier.priceCents <= 0 && !hasAnnualOption(tier)) {
    return { cents: 0, cadence: 'month', free: true, monthlyOnly: false }
  }
  if (selected === 'year' && hasAnnualOption(tier)) {
    return { cents: tier.annualPriceCents as number, cadence: 'year', free: false, monthlyOnly: false }
  }
  return {
    cents: tier.priceCents,
    cadence: tier.interval,
    free: false,
    // Only a MONTHLY tier can be monthly-only. A legacy yearly or one-time tier is already showing
    // its real cadence, so saying "monthly only" about it would be false.
    monthlyOnly: selected === 'year' && tier.interval === 'month',
  }
}

/** The cadence a JOIN should be recorded and billed on, given what the member picked and what the
 *  tier actually offers. A yearly pick on a tier with no yearly price resolves to the cadence the
 *  tier really has, never to a silent yearly charge. PURE; the server re-runs it on every write. */
export function resolveBillingInterval(tier: TierPrices, selected: BillingInterval): BillingInterval {
  if (selected === 'year' && hasAnnualOption(tier)) return 'year'
  return tier.interval === 'year' ? 'year' : 'month'
}

const MONTH_WORD = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
]

/**
 * What the yearly price saves against twelve months of the monthly one, said honestly, or null when
 * there is nothing true to say. PURE.
 *
 *   monthly 4400, annual 44000  -> 'Two months free'   (exactly ten months of the monthly price)
 *   monthly 4400, annual 45000  -> 'Save $78 a year'
 *   monthly 4400, annual 52800  -> null                (same money, so no claim)
 *   monthly 4400, annual 60000  -> null                (yearly costs more; the operator's call)
 */
export function annualSavingLabel(monthlyCents: number, annualCents: number | null): string | null {
  if (!Number.isFinite(monthlyCents) || !Number.isFinite(annualCents ?? NaN)) return null
  const monthly = Math.round(monthlyCents)
  const annual = Math.round(annualCents as number)
  if (monthly <= 0 || annual <= 0) return null
  const saving = monthly * 12 - annual
  if (saving <= 0) return null
  const monthsFree = saving / monthly
  if (Number.isInteger(monthsFree) && monthsFree >= 1 && monthsFree <= 11) {
    const word = MONTH_WORD[monthsFree]
    return `${word} month${monthsFree === 1 ? '' : 's'} free`
  }
  return `Save ${formatPriceCents(saving)} a year`
}
