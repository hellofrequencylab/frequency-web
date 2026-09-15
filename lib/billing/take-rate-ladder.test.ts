import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  NETWORK_TAKE_RATE_DEFAULT,
  OWN_AUDIENCE_BPS,
  TAKE_RATE_RUNGS,
  networkTakeRateBpsForPlan,
  networkTakeRateFromStored,
  sourceAwareTakeRateCents,
  sourceAwareMemberTakeRateCents,
  takeRateBps,
  takeRateRungForPlan,
  type NetworkTakeRate,
} from './pricing-keys'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { SPACE_PLANS } from '@/lib/pricing/plans'

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
  // The three paid labels stand on ONE rung (LIVE-230): Collective merged into Business, and Independent
  // is a paid plan like any other (a disconnected one collapses to `self` upstream, in effectiveOrderSource).
  { label: 'Business', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'business', s, r), expectedBps: 300 },
  { label: 'Collective', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'collective', s, r), expectedBps: 300 },
  { label: 'Independent', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'independent', s, r), expectedBps: 300 },
  { label: 'Non Profit', charge: (g, s, r) => sourceAwareTakeRateCents(g, 'nonprofit', s, r), expectedBps: 0 },
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
    expect(r.paid).toBeLessThan(r.member) // a paid Space beats Crew
    expect(r.nonprofit).toBeLessThanOrEqual(r.paid)
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
    const partial = { ...NETWORK_TAKE_RATE_DEFAULT, paid: 250 }
    expect(sourceAwareTakeRateCents(GROSS, 'business', 'network', partial)).toBe(250)
    expect(sourceAwareTakeRateCents(GROSS, 'collective', 'network', partial)).toBe(250) // same rung
    expect(sourceAwareTakeRateCents(GROSS, 'free', 'network', partial)).toBe(1000)
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

// ── TWO NUMBERS PLUS TWO ZEROS (LIVE-230, docs/CORE-MODEL.md §5 phase 4) ────────────────────────────
//
// The ladder is keyed by RUNG, not by plan name. `takeRateRungForPlan` is the one place a plan meets it,
// `takeRateBps` is the one place the own-audience zero meets it, and `networkTakeRateFromStored` is the
// one place a stored row of either vintage becomes the vector. Everything below pins those three seams.

describe('the resolver: four outcomes, and nothing else', () => {
  it('free 1000 / paid 300 / nonprofit 0 / own audience 0, in basis points', () => {
    expect(takeRateBps('free', 'network')).toBe(1000)
    for (const paid of ['business', 'collective', 'independent'] as const) {
      expect(takeRateBps(paid, 'network'), paid).toBe(300)
      expect(takeRateRungForPlan(paid), paid).toBe('paid')
    }
    expect(takeRateBps('nonprofit', 'network')).toBe(0)
    expect(takeRateRungForPlan('nonprofit')).toBe('nonprofit')
    // The fourth outcome has no plan: every rung pays 0 on the seller's own audience.
    for (const plan of SPACE_PLANS) expect(takeRateBps(plan, 'self'), plan).toBe(OWN_AUDIENCE_BPS)
    expect(OWN_AUDIENCE_BPS).toBe(0)
  })

  it('the ladder carries exactly the three Space rungs, and the resolver can place every plan on one', () => {
    expect([...TAKE_RATE_RUNGS]).toEqual(['free', 'paid', 'nonprofit'])
    for (const plan of SPACE_PLANS) expect(TAKE_RATE_RUNGS).toContain(takeRateRungForPlan(plan))
    // No plan-named rung survives on the vector: the five old keys resolve THROUGH the map, never off it.
    expect(Object.keys(NETWORK_TAKE_RATE_DEFAULT).sort()).toEqual(['free', 'member', 'memberFree', 'nonprofit', 'paid'])
  })

  it('an unknown plan resolves to the FREE rung: it never throws, and it is never 0', () => {
    // A missing or misspelled key must not become a free ride. The free rung is the HIGHER rate, so a
    // misconfiguration over-collects (and is noticed) rather than quietly under-collecting.
    for (const plan of ['', 'nonsense', 'pro-max', null, undefined]) {
      expect(() => takeRateRungForPlan(plan)).not.toThrow()
      expect(takeRateRungForPlan(plan)).toBe('free')
      expect(takeRateBps(plan, 'network')).toBe(1000)
      expect(networkTakeRateBpsForPlan(plan)).not.toBe(0)
    }
  })

  it('a rung an override left absent or non-numeric falls back to the seeded rung, never undefined and never 0', () => {
    const broken = { ...NETWORK_TAKE_RATE_DEFAULT, paid: undefined as unknown as number, free: Number.NaN }
    expect(networkTakeRateBpsForPlan('business', broken)).toBe(300)
    expect(networkTakeRateBpsForPlan('free', broken)).toBe(1000)
    expect(Number.isFinite(sourceAwareTakeRateCents(GROSS, 'business', 'network', broken))).toBe(true)
  })
})

describe('the stored row: either vintage resolves to the same vector', () => {
  it('a row written BEFORE LIVE-230 (keyed by plan name) resolves to the ruling, and its retired keys are not read', () => {
    // The exact shape 20270203000000_seed_take_rate_vector.sql wrote: five rates for what is now one rung.
    const legacy = {
      free_bps: 500, business_bps: 300, nonprofit_bps: 300,
      member_free_bps: 1000, member_bps: 800,
      network_bps: { free: 1000, business: 500, collective: 300, nonprofit: 0, independent: 0 },
    }
    const vec = networkTakeRateFromStored(legacy)
    expect(vec).toEqual({ free: 1000, paid: 300, nonprofit: 0, memberFree: 1000, member: 800 })
    // `business: 500` in that row was never charged and is not what the paid rung reads.
    expect(networkTakeRateBpsForPlan('business', vec)).toBe(300)
    expect('business' in vec).toBe(false)
  })

  it('a row written AFTER LIVE-230 (keyed by rung) is read as stored, rung by rung', () => {
    const vec = networkTakeRateFromStored({
      network_bps: { free: 1200, paid: 250, nonprofit: 0 },
      member_free_bps: 1100,
      member_bps: 700,
    })
    expect(vec).toEqual({ free: 1200, paid: 250, nonprofit: 0, memberFree: 1100, member: 700 })
  })

  it('an empty, partial, or malformed row never leaves a rung undefined or at 0 by accident', () => {
    expect(networkTakeRateFromStored(null)).toEqual(NETWORK_TAKE_RATE_DEFAULT)
    expect(networkTakeRateFromStored({})).toEqual(NETWORK_TAKE_RATE_DEFAULT)
    expect(networkTakeRateFromStored({ network_bps: { paid: 'three' } })).toEqual(NETWORK_TAKE_RATE_DEFAULT)
    expect(networkTakeRateFromStored({ network_bps: { paid: 200 } })).toEqual({ ...NETWORK_TAKE_RATE_DEFAULT, paid: 200 })
    // The seeded default is the code default, and the code default is the ladder.
    expect(PRICING_DEFAULTS.take_rate.network_bps).toEqual({ free: 1000, paid: 300, nonprofit: 0 })
  })
})

describe('source shape: no reader indexes network_bps by plan name outside the resolver', () => {
  /** Every .ts/.tsx under the app's source roots, excluding node_modules and build output. Walks with
   *  dirents (one filesystem call per directory, HYG-041), never readdir-then-stat. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name
      if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
      const full = join(dir, name)
      if (entry.isDirectory()) sourceFiles(full, out)
      else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full)
    }
    return out
  }

  it('the retired plan-named keys are read nowhere (a plan meets the ladder only through takeRateRungForPlan)', () => {
    // Before LIVE-230 six readers indexed the vector by plan name (the grid, the meter upsell, the CMS
    // template, the console, its action, the fee receipt), so a plan the vector did not name resolved to
    // `undefined` and a NaN fee. Now the vector has no plan names to index, and this keeps it that way.
    const RESOLVER = join(process.cwd(), 'lib', 'billing', 'pricing-keys.ts')
    const offenders: string[] = []
    for (const file of ['app', 'components', 'lib', 'scripts'].flatMap((d) => sourceFiles(join(process.cwd(), d)))) {
      if (file === RESOLVER || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      const text = readFileSync(file, 'utf8')
      if (/network_bps\s*(\?\.|\.|\[\s*['"])\s*(business|collective|independent)\b/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
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
    //
    // The anchor is the function's TERMINAL statement -- whatever hands the caller its session.
    // It was `if (!session.url)` until LIVE-359 moved that decision into ./checkout-ui, and this
    // guard went red on the move, which is the guard working: the property held, its landmark
    // shifted. Both ends are asserted to EXIST before they are compared, so a future rename
    // fails loudly here instead of making `indexOf` return -1 and passing by arithmetic accident.
    const receipt = TICKETS.slice(TICKETS.indexOf('THE FEE RECEIPT'))
    expect(receipt).toMatch(/try \{[\s\S]*catch \{/)
    const caught = receipt.indexOf('catch')
    const handedBack = receipt.indexOf('return resolveCheckoutSession(')
    expect(caught, 'no catch found after THE FEE RECEIPT').toBeGreaterThan(-1)
    expect(handedBack, 'the terminal return moved or was renamed -- re-anchor this guard').toBeGreaterThan(-1)
    expect(caught).toBeLessThan(handedBack)
  })
})
