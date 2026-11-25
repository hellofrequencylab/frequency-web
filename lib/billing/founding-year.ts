// THE FOUNDING YEAR PREPAY (LIVE-2541; owner rulings 2026-11-23, recorded in the launch milestones doc).
//
// What the owner ruled, in his words and numbers:
//   - Business Founding Year $441 (nine months of $49 paid for twelve) and Collective $990, both PAID NOW.
//   - The paid year runs February 1, 2027 to January 31, 2028. Everything is free in the beta through
//     January 31, so a buyer who paid "a year from today" would be paying for two months everyone gets
//     free. That breaks the honesty rule, so the year starts on February 1 whatever day they pay.
//   - No 14-day trial on these. The money moves on the day they buy.
//
// HOW STRIPE CARRIES IT. A subscription cannot bill a year now and start that year ten weeks later, so the
// checkout sells two lines: a ONE-TIME line for the Founding Year (charged today, the whole price), and the
// plan's ordinary YEARLY price, held until the paid year ends (`trial_end` = February 1, 2028). Stripe
// therefore files the subscription as `trialing` until then; nothing about it is a free trial, the year was
// paid up front. On February 1, 2028 it renews at the plan's yearly price (Business $490 list; Collective
// keeps its $990 Founding rate, the lock the reconciler records). The metadata key below is how every
// later reader (the receipt, the trial-ending notice, the Founder record) tells the two apart.
//
// PURE + framework-free: the checkout and the webhook resolve the facts, this decides.

import { collectiveFoundingOpen } from '@/lib/pricing/beta'
import type { BillingInterval } from './pricing-keys'

/** The plans that sell a Founding Year. Network has its own first-year coupon (NETWORK_PLAN). */
export type FoundingYearPlan = 'business' | 'collective'

/** The one place the Founding Year's facts live. A surface reads these, never restates the numbers. */
export const FOUNDING_YEAR = {
  /** What the year costs, paid at checkout. Business: nine months of $49. Collective: its $990 Founding year. */
  priceCents: { business: 44_100, collective: 99_000 } as Readonly<Record<FoundingYearPlan, number>>,
  /** What the plan renews at once the paid year is over (Business list yearly, Collective Founding yearly). */
  renewalCents: { business: 49_000, collective: 99_000 } as Readonly<Record<FoundingYearPlan, number>>,
  /** The monthly rate the Founder record locks (founding_members.locked_rate_cents is per month). */
  monthlyRateCents: { business: 4_900, collective: 9_900 } as Readonly<Record<FoundingYearPlan, number>>,
  /** The paid year: midnight Pacific February 1, 2027 to midnight Pacific February 1, 2028. */
  yearStartsAt: '2027-02-01T08:00:00.000Z',
  yearEndsAt: '2028-02-01T08:00:00.000Z',
  yearStartsLabel: 'February 1, 2027',
  yearEndsLabel: 'January 31, 2028',
  /** The checkout metadata value that marks a Founding Year purchase (session and subscription). */
  metadataValue: 'prepay',
  /** The numbered Founder seats (owner 2026-11-23: "150, numbered and visible"). Once they are taken the
   *  Founding Year stops selling and yearly is the plan's ordinary yearly price (LIVE-2542). */
  seatCap: 150,
  /** The Founder fee perk (owner 2026-11-23): no finder's fee on anyone through January 31, 2028. It
   *  replaces the old 3% buy-down promise. Midnight Pacific February 1, 2028 (LIVE-2543). */
  noFindersFeeUntil: '2028-02-01T08:00:00.000Z',
} as const

/** The metadata key a Founding Year session and its subscription carry. */
export const FOUNDING_YEAR_METADATA_KEY = 'founding_year'

/** Narrow a plan string to a Founding Year plan, or null. PURE. */
export function asFoundingYearPlan(plan: string | null | undefined): FoundingYearPlan | null {
  return plan === 'business' || plan === 'collective' ? plan : null
}

/** Can a Founding Year still be bought at `now`? It closes when the paid year starts: after that a
 *  "year from February 1" is no longer ahead of anyone. Shares the Founding offer's one end instant. PURE. */
export function foundingYearOpen(now: Date = new Date()): boolean {
  return collectiveFoundingOpen(now) && now.getTime() < Date.parse(FOUNDING_YEAR.yearStartsAt)
}

/** Does this checkout sell the Founding Year? Yearly, Business or Collective, while it is open, and only
 *  for a Space with no locked price on its base plan (a Space already paying keeps its own subscription,
 *  changed through the billing portal). PURE. */
export function foundingYearApplies(input: {
  plan: string | null | undefined
  interval: BillingInterval
  baseLocked: boolean
  now?: Date
}): FoundingYearPlan | null {
  const plan = asFoundingYearPlan(input.plan)
  if (!plan || input.interval !== 'year' || input.baseLocked) return null
  return foundingYearOpen(input.now ?? new Date()) ? plan : null
}

/** The Founding Year's price for a plan, in cents. PURE. */
export function foundingYearCents(plan: FoundingYearPlan): number {
  return FOUNDING_YEAR.priceCents[plan]
}

/** The Stripe `trial_end` (unix seconds) that holds the yearly price until the paid year is over. PURE. */
export function foundingYearRenewsAtUnix(): number {
  return Math.floor(Date.parse(FOUNDING_YEAR.yearEndsAt) / 1000)
}

/** The name the one-time Founding Year line carries on Stripe's page and the receipt. PURE. */
export function foundingYearLineName(plan: FoundingYearPlan): string {
  const label = plan === 'business' ? 'Business' : 'Collective'
  return `Frequency ${label} Founding Year, ${FOUNDING_YEAR.yearStartsLabel} to ${FOUNDING_YEAR.yearEndsLabel}`
}

/** Is this Stripe metadata (a session's or a subscription's) a Founding Year purchase? PURE. */
export function isFoundingYearMetadata(meta: Record<string, string> | null | undefined): boolean {
  return meta?.[FOUNDING_YEAR_METADATA_KEY] === FOUNDING_YEAR.metadataValue
}

/** The plain sentence beside a Founding Year price. PURE. */
export function foundingYearNote(plan: FoundingYearPlan): string {
  const renew = FOUNDING_YEAR.renewalCents[plan] / 100
  return `Founding Year, paid today. Your paid year runs ${FOUNDING_YEAR.yearStartsLabel} to ${FOUNDING_YEAR.yearEndsLabel}, then renews at $${renew} a year. No trial, and no finder's fee on any sale through ${FOUNDING_YEAR.yearEndsLabel}.`
}

// ── FOUNDER SEATS (LIVE-2542) ─────────────────────────────────────────────────────────────────────────
// A Founder is a Space that PAID its Founding Year, in cash or by card; comped Spaces do not count (the
// launch milestones doc). The seat is not a stored number: it is the Space's place in payment order among
// every founding_members row carrying `meta.founding_year`, so two payments landing at once can never be
// handed the same number and no migration is needed. A row that later lapses keeps its seat (the number
// is retired with it, never handed on), which is why the count reads every status.

/** One Founding Year as the seat numbering reads it. */
export interface FounderSeatRow {
  spaceId: string
  /** When the year was paid (ISO). The seat order. */
  paidAt: string
  /** The row id, the tiebreak for two payments in the same instant. */
  id: string
}

/** Number the seats: payment order, then row id. Returns spaceId -> seat (1-based). PURE. */
export function numberFounderSeats(rows: readonly FounderSeatRow[]): Map<string, number> {
  const ordered = [...rows]
    .filter((r) => r.spaceId && Number.isFinite(Date.parse(r.paidAt)))
    .sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out = new Map<string, number>()
  for (const r of ordered) if (!out.has(r.spaceId)) out.set(r.spaceId, out.size + 1)
  return out
}

/** Seats left of the 150, never below zero. PURE. */
export function founderSeatsLeft(taken: number): number {
  return Math.max(0, FOUNDING_YEAR.seatCap - Math.max(0, Math.trunc(taken)))
}

// ── THE FOUNDER FEE PERK (LIVE-2543) ─────────────────────────────────────────────────────────────────

/** Does a Space's sale skip the finder's fee because the Space is a Founder? True for an ACTIVE founder
 *  row that holds a paid Founding Year, until the perk ends. A lapsed Founder pays the ordinary fee. PURE. */
export function founderPaysNoFindersFee(input: { active: boolean; hasFoundingYear: boolean; now?: Date }): boolean {
  if (!input.active || !input.hasFoundingYear) return false
  const until = Date.parse(FOUNDING_YEAR.noFindersFeeUntil)
  return Number.isFinite(until) && (input.now ?? new Date()).getTime() < until
}
