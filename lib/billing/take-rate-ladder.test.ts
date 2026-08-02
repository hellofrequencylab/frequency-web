import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  NETWORK_TAKE_RATE_DEFAULT,
  sourceAwareTakeRateCents,
  sourceAwareMemberTakeRateCents,
  type NetworkTakeRate,
} from './pricing-keys'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'

// ── THE WHOLE LADDER, AS A TABLE (Phase 2, docs/VALUE-LADDER.md · ADR-914) ──────────────────────
//
// The take rate IS the product ladder now. Selling is free on every tier, so the only thing a member
// buys when they upgrade is a smaller number here, and every claim on /pricing is a promise about one
// of these cells. Testing them one assertion at a time is how a ladder ends up with a rung that reads
// right in isolation and wrong in sequence, so this enumerates every rung × every source.

interface Rung {
  label: string
  /** How this seller's fee is computed — the two functions are genuinely different code paths. */
  charge: (gross: number, source: 'self' | 'network', rate?: NetworkTakeRate) => number
  expectedBps: number
}

const LADDER: Rung[] = [
  {
    label: 'free Member',
    charge: (g, s, r) => sourceAwareMemberTakeRateCents(g, s, r, 'free'),
    expectedBps: 1000,
  },
  {
    label: 'Crew',
    charge: (g, s, r) => sourceAwareMemberTakeRateCents(g, s, r, 'crew'),
    expectedBps: 800,
  },
  { label: 'free Space', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'free', s, r), expectedBps: 1000 },
  { label: 'Business', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'business', s, r), expectedBps: 500 },
  { label: 'Collective', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'collective', s, r), expectedBps: 300 },
  { label: 'Non Profit', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'nonprofit', s, r), expectedBps: 0 },
  { label: 'Independent', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'independent', s, r), expectedBps: 0 },
]

const GROSS = 10_000 // $100, so a bps rung reads directly as cents

describe('every rung × every source: the fourteen outcomes', () => {
  it.each(LADDER)('$label pays its published rate on a NETWORK-sourced sale', ({ charge, expectedBps }) => {
    expect(charge(GROSS, 'network')).toBe(expectedBps)
  })

  it.each(LADDER)('$label pays ZERO on a sale to their own audience', ({ charge }) => {
    // 🔴 THE PROMISE HAS NO TIER. This is the one row of the table that must never vary, and it is the
    // claim the entire pricing model is built on: "once you have your contact, Frequency doesn't take
    // a cut." If a single rung ever charges here, the headline on /pricing becomes false.
    expect(charge(GROSS, 'self')).toBe(0)
  })
})

describe('the ladder descends, and every rung is worth its price', () => {
  it('each paid rung is strictly cheaper than the one below it', () => {
    const r = NETWORK_TAKE_RATE_DEFAULT
    // A rung that does not lower the rate is a rung nobody has a reason to buy.
    expect(r.member).toBeLessThan(r.memberFree) // Crew beats free Member
    expect(r.business).toBeLessThan(r.member) // Business Space beats Crew
    expect(r.collective).toBeLessThan(r.business) // Collective beats Business
    expect(r.nonprofit).toBeLessThanOrEqual(r.collective)
  })

  it('a free Space and a free Member pay the SAME rate', () => {
    // A free Space is held to the free-Member standard (owner ruling). If these diverged, moving a sale
    // into a free Space would change its rate, and the ladder would have a rung nobody paid for.
    expect(NETWORK_TAKE_RATE_DEFAULT.free).toBe(NETWORK_TAKE_RATE_DEFAULT.memberFree)
  })

  it('Crew pays for itself at a believable volume', () => {
    // The upgrade has to be arithmetic a seller can do in their head, not a leap of faith. At $9/mo and
    // a 200bps saving, Crew breaks even at $450/mo of network-sourced sales. Asserted so a future rate
    // change cannot quietly push the break-even somewhere nobody would ever reach.
    const savingBps = NETWORK_TAKE_RATE_DEFAULT.memberFree - NETWORK_TAKE_RATE_DEFAULT.member
    const crewMonthlyCents = PRICING_DEFAULTS.tier.crew.monthly_cents
    const breakEvenCents = Math.round((crewMonthlyCents * 10000) / savingBps)
    expect(breakEvenCents).toBeLessThanOrEqual(100_000) // under $1,000/mo of sourced sales
  })
})

describe('rounding never favours the platform', () => {
  it.each(LADDER)('$label: the fee is FLOORED, so the seller is never short a cent', ({ charge, expectedBps }) => {
    // 333 cents at any rung lands on a fraction. Flooring means the platform eats the remainder.
    const exact = (333 * expectedBps) / 10000
    expect(charge(333, 'network')).toBe(Math.floor(exact))
  })

  it.each(LADDER)('$label: a zero, negative, or NaN gross is never charged', ({ charge }) => {
    for (const gross of [0, -1, -10_000, Number.NaN]) {
      expect(charge(gross, 'network')).toBe(0)
    }
  })
})

describe('an operator override moves the real rate, and cannot break it', () => {
  it('a partial override leaves every untouched rung at its seeded value', () => {
    // getPricingValues merges per-field over the code default precisely so a partial row cannot leave a
    // tier undefined and produce a NaN fee. Proven here at the math layer.
    const partial = { ...NETWORK_TAKE_RATE_DEFAULT, business: 250 }
    expect(sourceAwareTakeRateCents(GROSS, 'business', 'network', partial)).toBe(250)
    expect(sourceAwareTakeRateCents(GROSS, 'collective', 'network', partial)).toBe(300)
    expect(sourceAwareMemberTakeRateCents(GROSS, 'network', partial, 'free')).toBe(1000)
  })

  it('🔴 the console can edit BOTH member rungs, not just Crew', () => {
    // The free-Member rung is the most-charged number in the product now, and it was absent from the
    // console when it was reintroduced — an operator could move every rate except the one most sales
    // actually use. Source-guarded because the alternative is rendering a React admin console.
    const actions = readFileSync('app/(main)/admin/pricing/actions.ts', 'utf8')
    const console_ = readFileSync('app/(main)/admin/pricing/pricing-console.tsx', 'utf8')
    expect(actions).toContain('member_free_bps: clamp(rate.member_free_bps)')
    expect(console_).toContain('member_free_bps: bps(memberFree)')
  })

  it('🔴 the save is read-modify-write, so editing one rate cannot wipe a sibling', () => {
    // setPricingSetting REPLACES the whole take_rate jsonb, so writing a bare object silently deletes
    // every field omitted. A previous version of this action wrote only the legacy flat fields and
    // dropped the entire network vector on the way past, reverting live rates to code defaults on
    // every operator save.
    const actions = readFileSync('app/(main)/admin/pricing/actions.ts', 'utf8')
    expect(actions).toContain('const current = (await getPricingValues()).take_rate')
    expect(actions).toMatch(/\.\.\.current,/)
  })
})

describe('the fee a ticket charged is recoverable afterwards', () => {
  const TICKETS = readFileSync('lib/billing/tickets.ts', 'utf8')

  it('records the rate applied rather than leaving it to be recomputed', () => {
    // platform_fee_cents / gross cannot recover the rate: the fee floors fractional cents, and an
    // operator changing a rate would silently rewrite the history of every past sale if the rate were
    // derived at read time.
    expect(TICKETS).toContain('take_rate_bps: rateBps')
    expect(TICKETS).toContain('order_source: effectiveSource')
  })

  it('persists the EFFECTIVE source, not the classified one', () => {
    // A disconnected Space collapses 'network' to 'self'. Persisting the classified source would write
    // 'network' beside a 0% fee and look like a bug in exactly the audit this exists to satisfy.
    expect(TICKETS).toContain("let effectiveSource: typeof source = source")
    expect(TICKETS).toContain('attribution_ref: effectiveSource === source ? attributionRef : null')
  })

  it('the receipt write can never fail the sale', () => {
    // The buyer has a live Checkout session by this point. Losing the explanation for a fee is bad;
    // losing the sale to protect the explanation is worse.
    const receipt = TICKETS.slice(TICKETS.indexOf('THE FEE RECEIPT'))
    expect(receipt).toMatch(/try \{[\s\S]*catch \{/)
    expect(receipt.indexOf('catch')).toBeLessThan(receipt.indexOf('if (!session.url)'))
  })
})
