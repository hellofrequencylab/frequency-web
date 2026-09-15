import { describe, it, expect } from 'vitest'

// MEMBER BENEFITS — THE CONTRACT (ADR-1372, backlog LIVE-090). What is locked here, all network-free
// because lib/spaces/benefits.ts is pure by construction:
//
//   1. 🔴 BENEFITS NEVER STACK. Two applicable benefits resolve to the single HIGHER discount, never
//      to their sum. The named case is a 15% and a 20% row on one purchase: 20% off, not 35%.
//   2. 🔴 A TOTAL IS NEVER NEGATIVE. A fixed_price beside a percent is the shape that produces one
//      if anybody ever adds them up, so it gets its own test at several list prices.
//   3. Each kind reads `value` in ITS OWN unit: included ignores it (100% off), percent is BASIS
//      POINTS (1500 = 15%), amount_off and fixed_price are CENTS. Getting this wrong is a 100x
//      pricing error that no type can catch.
//   4. The discount is clamped to [0, listCents] in every kind — a benefit can never hand money back.
//   5. Applicability is FAIL-CLOSED on every axis: tier assignment, scope, the active flag, the date
//      window and the usage cap. A benefit that cannot be PROVEN applicable does not apply.
//   6. The tie-break is deterministic on benefit id, so array order can never change what a buyer
//      pays — a property test over every permutation, not one lucky ordering.
//   7. normalizeBenefit drops a row it cannot make valid rather than guessing, because every guess
//      here is a guess about money.
//
// Plus the two PURE helpers that live in the IO module because they are only used there:
// `periodKeyFor` (which bucket a redemption counts against) and `planBenefitSetOps` (the id
// preservation that keeps assignments and the redemption ledger pointing at the same rows).

import {
  benefitApplies,
  benefitDiscountCents,
  normalizeBenefit,
  payableCents,
  resolveBenefit,
  valueCeilingFor,
  type BenefitContext,
  type MemberBenefit,
} from './benefits'
import { periodKeyFor, planBenefitSetOps } from './benefits-store'

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

const SPACE = 'space-0000-4000-a000-00000000spce'
const TIER = 'tier-0000-4000-a000-00000000tier'
const OTHER_TIER = 'tier-0000-4000-a000-0000000other'
const NOW = '2026-03-21T12:00:00.000Z'

/** A complete, applicable benefit. Every test starts from a row that WORKS and breaks exactly one
 *  thing, so a passing assertion can only be explained by the axis under test. */
function benefit(over: Partial<MemberBenefit> = {}): MemberBenefit {
  return {
    id: 'benefit-aaaa',
    spaceId: SPACE,
    kind: 'percent',
    value: 1500,
    scope: 'space_events',
    label: 'Temple Member, 15% off',
    maxUses: null,
    period: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    tierIds: [TIER],
    ...over,
  }
}

function ctx(over: Partial<BenefitContext> = {}): BenefitContext {
  return {
    listCents: 10_000,
    scope: 'space_events',
    tierId: TIER,
    now: NOW,
    ...over,
  }
}

/** Every ordering of a list, so "order does not matter" is proven rather than sampled. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([items[i], ...p])
  }
  return out
}

// ── 1. Benefits never stack ─────────────────────────────────────────────────────────────────────

describe('resolveBenefit — 🔴 benefits NEVER stack (ADR-1372 §1)', () => {
  it('resolves a 15% and a 20% benefit to 20% off, never 35%', () => {
    const fifteen = benefit({ id: 'benefit-15', value: 1500, label: '15% off' })
    const twenty = benefit({ id: 'benefit-20', value: 2000, label: '20% off' })

    const applied = resolveBenefit([fifteen, twenty], ctx({ listCents: 10_000 }))

    expect(applied).not.toBeNull()
    expect(applied!.benefitId).toBe('benefit-20')
    expect(applied!.discountCents).toBe(2000) // 20% of 10000 — NOT 3500
    expect(applied!.amountCents).toBe(8000)
    // The sum would be 3500/6500. Asserted explicitly so a future stacking bug reads as a diff.
    expect(applied!.discountCents).not.toBe(3500)
  })

  it('does not stack across kinds either: the single best of four applicable benefits wins', () => {
    const all = [
      benefit({ id: 'b-pct', kind: 'percent', value: 1000 }), //   1,000 off
      benefit({ id: 'b-amt', kind: 'amount_off', value: 2500 }), // 2,500 off
      benefit({ id: 'b-fix', kind: 'fixed_price', value: 6000 }), // 4,000 off
      benefit({ id: 'b-inc', kind: 'included' }), //               10,000 off
    ]
    const applied = resolveBenefit(all, ctx({ listCents: 10_000 }))
    expect(applied!.benefitId).toBe('b-inc')
    expect(applied!.discountCents).toBe(10_000)
    // The sum of all four would be 17,500 on a 10,000 purchase.
    expect(applied!.discountCents).toBeLessThanOrEqual(10_000)
  })

  it('the winner is the higher discount even when the smaller benefit is listed first or last', () => {
    const small = benefit({ id: 'b-small', kind: 'amount_off', value: 100 })
    const big = benefit({ id: 'b-big', kind: 'amount_off', value: 900 })
    for (const order of [
      [small, big],
      [big, small],
    ]) {
      expect(resolveBenefit(order, ctx())!.discountCents).toBe(900)
    }
  })
})

// ── 2. A total is never negative ────────────────────────────────────────────────────────────────

describe('resolveBenefit — 🔴 a fixed_price beside a percent can never go negative', () => {
  it('a 90% benefit and a $5 fixed price on a $10 line charges the better of the two, not below zero', () => {
    const pct = benefit({ id: 'b-pct', kind: 'percent', value: 9000 }) // 900 off
    const fixed = benefit({ id: 'b-fix', kind: 'fixed_price', value: 500 }) // 500 off

    const { amountCents, applied } = payableCents([pct, fixed], ctx({ listCents: 1000 }))

    expect(applied!.benefitId).toBe('b-pct')
    expect(amountCents).toBe(100)
    expect(amountCents).toBeGreaterThanOrEqual(0)
    // Summing the two discounts would be 1,400 off a 1,000 line: a -400 charge.
  })

  it('stays at or above zero for every list price when a fixed_price and a percent both apply', () => {
    const pct = benefit({ id: 'b-pct', kind: 'percent', value: 9900 })
    const fixed = benefit({ id: 'b-fix', kind: 'fixed_price', value: 1 })
    for (const listCents of [1, 2, 99, 100, 999, 1000, 12_345, 1_000_000]) {
      const { amountCents, applied } = payableCents([pct, fixed], ctx({ listCents }))
      expect(amountCents).toBeGreaterThanOrEqual(0)
      expect(amountCents).toBeLessThanOrEqual(listCents)
      if (applied) expect(applied.amountCents).toBe(listCents - applied.discountCents)
    }
  })

  it('an `included` beside a fixed_price of 0 still charges exactly zero, never less', () => {
    const inc = benefit({ id: 'b-inc', kind: 'included' })
    const free = benefit({ id: 'b-fix', kind: 'fixed_price', value: 0 })
    const { amountCents } = payableCents([inc, free], ctx({ listCents: 4200 }))
    expect(amountCents).toBe(0)
  })
})

// ── 3. Each kind reads `value` in its own unit ──────────────────────────────────────────────────

describe('benefitDiscountCents — each kind reads `value` in its own unit', () => {
  it('`included` is 100% off, whatever the list price', () => {
    for (const list of [1, 500, 10_000, 99_999_999]) {
      expect(benefitDiscountCents({ kind: 'included', value: 0 }, list)).toBe(list)
    }
  })

  it('`included` ignores a stale value rather than reading it as a rate', () => {
    expect(benefitDiscountCents({ kind: 'included', value: 1 }, 10_000)).toBe(10_000)
    expect(benefitDiscountCents({ kind: 'included', value: 9_999_999 }, 10_000)).toBe(10_000)
  })

  it('`percent` reads BASIS POINTS: 1500 = 15%, not 1500%', () => {
    expect(benefitDiscountCents({ kind: 'percent', value: 1500 }, 10_000)).toBe(1500)
    expect(benefitDiscountCents({ kind: 'percent', value: 2000 }, 10_000)).toBe(2000)
    expect(benefitDiscountCents({ kind: 'percent', value: 100 }, 10_000)).toBe(100) // 1%
    expect(benefitDiscountCents({ kind: 'percent', value: 10_000 }, 10_000)).toBe(10_000) // 100%
  })

  it('`percent` rounds to the nearest whole cent, deterministically', () => {
    // 1500 bps of 333 = 49.95
    expect(benefitDiscountCents({ kind: 'percent', value: 1500 }, 333)).toBe(50)
    // 1500 bps of 1 = 0.0015 -> 0, and a zero discount is simply no discount.
    expect(benefitDiscountCents({ kind: 'percent', value: 1500 }, 1)).toBe(0)
  })

  it('`amount_off` reads CENTS off the list price', () => {
    expect(benefitDiscountCents({ kind: 'amount_off', value: 1500 }, 10_000)).toBe(1500)
    expect(benefitDiscountCents({ kind: 'amount_off', value: 1 }, 10_000)).toBe(1)
  })

  it('`fixed_price` reads CENTS the member pays instead of the list price', () => {
    expect(benefitDiscountCents({ kind: 'fixed_price', value: 2500 }, 10_000)).toBe(7500)
    expect(benefitDiscountCents({ kind: 'fixed_price', value: 0 }, 10_000)).toBe(10_000)
  })

  it('valueCeilingFor separates a rate from an amount', () => {
    expect(valueCeilingFor('percent')).toBe(10_000)
    expect(valueCeilingFor('amount_off')).toBeGreaterThan(10_000)
    expect(valueCeilingFor('fixed_price')).toBeGreaterThan(10_000)
  })
})

// ── 4. The clamp to [0, listCents] ──────────────────────────────────────────────────────────────

describe('benefitDiscountCents — clamped to [0, listCents] in every kind', () => {
  it('an amount_off larger than the list price discounts the list price, no more', () => {
    expect(benefitDiscountCents({ kind: 'amount_off', value: 99_999 }, 1000)).toBe(1000)
  })

  it('a fixed_price AT or ABOVE the list price is not a discount at all', () => {
    expect(benefitDiscountCents({ kind: 'fixed_price', value: 1000 }, 1000)).toBe(0)
    expect(benefitDiscountCents({ kind: 'fixed_price', value: 2000 }, 1000)).toBe(0)
    // ...and it never surfaces as an applied benefit with a zero line.
    expect(resolveBenefit([benefit({ kind: 'fixed_price', value: 2000 })], ctx({ listCents: 1000 })))
      .toBeNull()
  })

  it('a percent above 100% is clamped to the list price', () => {
    expect(benefitDiscountCents({ kind: 'percent', value: 50_000 }, 1000)).toBe(1000)
  })

  it('a negative or malformed value floors to no discount, never a refund', () => {
    for (const kind of ['percent', 'amount_off'] as const) {
      expect(benefitDiscountCents({ kind, value: -5000 }, 1000)).toBe(0)
      expect(benefitDiscountCents({ kind, value: Number.NaN }, 1000)).toBe(0)
    }
    // A malformed fixed_price is REJECTED, not floored (ADR-1372). Flooring its value to 0 would
    // make it read as "the member pays nothing", i.e. the most generous offer the system can make,
    // because 0 is also a legitimate fixed price. The two cases are indistinguishable after a
    // clamp, so the broken one is refused here rather than resolved.
    expect(benefitDiscountCents({ kind: 'fixed_price', value: -5000 }, 1000)).toBe(0)
    expect(benefitDiscountCents({ kind: 'fixed_price', value: Number.NaN }, 1000)).toBe(0)
    // A fixed price of 0 is still a real offer: the member genuinely pays nothing.
    expect(benefitDiscountCents({ kind: 'fixed_price', value: 0 }, 1000)).toBe(1000)
    // And normalization drops the malformed row entirely rather than storing a free one.
    expect(
      normalizeBenefit(
        { kind: 'fixed_price', value: -5000, scope: 'all', label: 'Broken', tierIds: ['t1'] },
        'space-1',
      ),
    ).toBeNull()
  })

  it('the date window fails CLOSED when the clock is unreadable', () => {
    // Every other axis fails closed; the window used to fail OPEN, so an unparseable `now` made an
    // EXPIRED benefit apply. A benefit with no window is unaffected.
    const windowed = benefit({ endsAt: '2020-01-01T00:00:00.000Z' })
    expect(benefitApplies(windowed, ctx({ now: 'not-a-date' }))).toBe(false)
    expect(benefitApplies(benefit({ startsAt: null, endsAt: null }), ctx({ now: 'not-a-date' }))).toBe(true)
  })

  it('a benefit from another Space never applies when the context names one', () => {
    const foreign = benefit({ spaceId: 'space-other' })
    expect(benefitApplies(foreign, ctx({ spaceId: 'space-1' }))).toBe(false)
    expect(benefitApplies(foreign, ctx({ spaceId: undefined }))).toBe(true)
  })

  it('a zero list price can never be discounted', () => {
    expect(benefitDiscountCents({ kind: 'included', value: 0 }, 0)).toBe(0)
    expect(resolveBenefit([benefit({ kind: 'included' })], ctx({ listCents: 0 }))).toBeNull()
    expect(payableCents([benefit({ kind: 'included' })], ctx({ listCents: 0 })).amountCents).toBe(0)
  })

  it('every kind stays within the clamp across a sweep of values and list prices', () => {
    for (const kind of ['included', 'percent', 'amount_off', 'fixed_price'] as const) {
      for (const value of [0, 1, 999, 1500, 10_000, 250_000]) {
        for (const list of [1, 100, 10_000, 5_000_000]) {
          const off = benefitDiscountCents({ kind, value }, list)
          expect(off).toBeGreaterThanOrEqual(0)
          expect(off).toBeLessThanOrEqual(list)
          expect(Number.isInteger(off)).toBe(true)
        }
      }
    }
  })
})

// ── 5. Applicability is fail-closed on every axis ───────────────────────────────────────────────

describe('benefitApplies — tier assignment is FAIL-CLOSED', () => {
  it('a buyer with no tier never gets a benefit', () => {
    expect(benefitApplies(benefit(), ctx({ tierId: null }))).toBe(false)
    expect(resolveBenefit([benefit()], ctx({ tierId: null }))).toBeNull()
    expect(payableCents([benefit()], ctx({ tierId: null, listCents: 10_000 })).amountCents).toBe(
      10_000,
    )
  })

  it('a benefit assigned to a different tier never applies', () => {
    expect(benefitApplies(benefit({ tierIds: [OTHER_TIER] }), ctx())).toBe(false)
  })

  it('a benefit assigned to NO tier applies to nobody', () => {
    expect(benefitApplies(benefit({ tierIds: [] }), ctx())).toBe(false)
  })

  it('a benefit assigned to several tiers applies to each of them', () => {
    const shared = benefit({ tierIds: [TIER, OTHER_TIER] })
    expect(benefitApplies(shared, ctx({ tierId: TIER }))).toBe(true)
    expect(benefitApplies(shared, ctx({ tierId: OTHER_TIER }))).toBe(true)
  })

  it('an inactive benefit, or one with no id, never applies', () => {
    expect(benefitApplies(benefit({ isActive: false }), ctx())).toBe(false)
    expect(benefitApplies(benefit({ id: undefined }), ctx())).toBe(false)
  })
})

describe('benefitApplies — scope matching', () => {
  it('`all` matches every scope', () => {
    const everywhere = benefit({ scope: 'all' })
    for (const scope of ['space_events', 'guest_events', 'stays', 'products'] as const) {
      expect(benefitApplies(everywhere, ctx({ scope }))).toBe(true)
    }
  })

  it('a scoped benefit matches only its own scope', () => {
    const stays = benefit({ scope: 'stays' })
    expect(benefitApplies(stays, ctx({ scope: 'stays' }))).toBe(true)
    for (const scope of ['space_events', 'guest_events', 'products'] as const) {
      expect(benefitApplies(stays, ctx({ scope }))).toBe(false)
    }
  })

  it('the Space`s own events and a guest-hosted event are different lanes', () => {
    expect(benefitApplies(benefit({ scope: 'space_events' }), ctx({ scope: 'guest_events' }))).toBe(
      false,
    )
    expect(benefitApplies(benefit({ scope: 'guest_events' }), ctx({ scope: 'space_events' }))).toBe(
      false,
    )
  })
})

describe('benefitApplies — date windows', () => {
  it('a benefit that has not started yet does not apply', () => {
    expect(benefitApplies(benefit({ startsAt: '2026-04-01T00:00:00.000Z' }), ctx())).toBe(false)
  })

  it('a benefit that has already ended does not apply', () => {
    expect(benefitApplies(benefit({ endsAt: '2026-03-01T00:00:00.000Z' }), ctx())).toBe(false)
  })

  it('the end bound is exclusive: a benefit ending exactly now is over', () => {
    expect(benefitApplies(benefit({ endsAt: NOW }), ctx())).toBe(false)
  })

  it('the start bound is inclusive: a benefit starting exactly now is live', () => {
    expect(benefitApplies(benefit({ startsAt: NOW }), ctx())).toBe(true)
  })

  it('a benefit inside its window applies', () => {
    expect(
      benefitApplies(
        benefit({ startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z' }),
        ctx(),
      ),
    ).toBe(true)
  })

  it('a null bound means unbounded on that side', () => {
    expect(benefitApplies(benefit({ startsAt: null, endsAt: null }), ctx())).toBe(true)
    expect(benefitApplies(benefit({ startsAt: '2020-01-01T00:00:00.000Z' }), ctx())).toBe(true)
    expect(benefitApplies(benefit({ endsAt: '2099-01-01T00:00:00.000Z' }), ctx())).toBe(true)
  })
})

describe('benefitApplies — the maxUses cap', () => {
  it('a benefit AT its cap does not apply', () => {
    const capped = benefit({ id: 'b-cap', maxUses: 1, period: 'month' })
    expect(benefitApplies(capped, ctx({ usesByBenefitId: { 'b-cap': 1 } }))).toBe(false)
  })

  it('a benefit OVER its cap does not apply', () => {
    const capped = benefit({ id: 'b-cap', maxUses: 2 })
    expect(benefitApplies(capped, ctx({ usesByBenefitId: { 'b-cap': 7 } }))).toBe(false)
  })

  it('a benefit UNDER its cap applies', () => {
    const capped = benefit({ id: 'b-cap', maxUses: 3 })
    expect(benefitApplies(capped, ctx({ usesByBenefitId: { 'b-cap': 2 } }))).toBe(true)
  })

  it('a MISSING uses entry counts as zero, not as unknown', () => {
    const capped = benefit({ id: 'b-cap', maxUses: 1 })
    expect(benefitApplies(capped, ctx({ usesByBenefitId: {} }))).toBe(true)
    expect(benefitApplies(capped, ctx({ usesByBenefitId: undefined }))).toBe(true)
    // Another benefit's count is not this benefit's count.
    expect(benefitApplies(capped, ctx({ usesByBenefitId: { 'b-other': 99 } }))).toBe(true)
  })

  it('an uncapped benefit ignores the uses map entirely', () => {
    const uncapped = benefit({ id: 'b-free', maxUses: null })
    expect(benefitApplies(uncapped, ctx({ usesByBenefitId: { 'b-free': 9999 } }))).toBe(true)
  })

  it('an exhausted benefit steps aside and the next-best one applies', () => {
    const exhausted = benefit({ id: 'b-best', kind: 'amount_off', value: 5000, maxUses: 1 })
    const spare = benefit({ id: 'b-spare', kind: 'amount_off', value: 1000 })
    const applied = resolveBenefit(
      [exhausted, spare],
      ctx({ listCents: 10_000, usesByBenefitId: { 'b-best': 1 } }),
    )
    expect(applied!.benefitId).toBe('b-spare')
    expect(applied!.discountCents).toBe(1000)
  })
})

// ── 6. Determinism ──────────────────────────────────────────────────────────────────────────────

describe('resolveBenefit — deterministic tie-break on benefit id', () => {
  it('two equal discounts resolve to the LOWER id regardless of array order', () => {
    const b = benefit({ id: 'benefit-bbbb', kind: 'amount_off', value: 2000, label: 'B' })
    const a = benefit({ id: 'benefit-aaaa', kind: 'amount_off', value: 2000, label: 'A' })
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      const applied = resolveBenefit(order, ctx())
      expect(applied!.benefitId).toBe('benefit-aaaa')
      expect(applied!.label).toBe('A')
    }
  })

  it('every permutation of a mixed set resolves identically', () => {
    const set = [
      benefit({ id: 'b-1', kind: 'percent', value: 2000 }), //     2,000 off
      benefit({ id: 'b-2', kind: 'amount_off', value: 2000 }), //  2,000 off (tie with b-1)
      benefit({ id: 'b-3', kind: 'amount_off', value: 500 }), //     500 off
      benefit({ id: 'b-4', kind: 'percent', value: 1500, scope: 'stays' }), // wrong scope
      benefit({ id: 'b-5', kind: 'included', tierIds: [OTHER_TIER] }), //     wrong tier
    ]
    const results = permutations(set).map((order) => resolveBenefit(order, ctx({ listCents: 10_000 })))
    expect(results).toHaveLength(120)
    for (const r of results) {
      expect(r!.benefitId).toBe('b-1') // 'b-1' < 'b-2' on the tie
      expect(r!.discountCents).toBe(2000)
      expect(r!.amountCents).toBe(8000)
    }
  })

  it('resolves to null when nothing applies, and payableCents then charges the list price', () => {
    const none = [benefit({ tierIds: [OTHER_TIER] }), benefit({ id: 'b-x', isActive: false })]
    expect(resolveBenefit(none, ctx())).toBeNull()
    expect(payableCents(none, ctx({ listCents: 7777 }))).toEqual({
      amountCents: 7777,
      applied: null,
    })
    expect(resolveBenefit([], ctx())).toBeNull()
  })

  it('payableCents always reports the amount the applied benefit named', () => {
    const { amountCents, applied } = payableCents([benefit({ value: 2500 })], ctx({ listCents: 8000 }))
    expect(applied!.discountCents).toBe(2000)
    expect(amountCents).toBe(6000)
    expect(amountCents).toBe(applied!.amountCents)
  })
})

// ── 7. normalizeBenefit is fail-closed ──────────────────────────────────────────────────────────

describe('normalizeBenefit — fail-closed (every guess here is a guess about money)', () => {
  const valid = {
    kind: 'percent',
    value: 1500,
    scope: 'space_events',
    label: 'Temple Member, 15% off',
    tierIds: [TIER],
  }

  it('accepts a clean row', () => {
    const n = normalizeBenefit(valid, SPACE)
    expect(n).not.toBeNull()
    expect(n).toMatchObject({
      spaceId: SPACE,
      kind: 'percent',
      value: 1500,
      scope: 'space_events',
      label: 'Temple Member, 15% off',
      maxUses: null,
      period: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      tierIds: [TIER],
    })
    expect(n!.id).toBeUndefined()
  })

  it('drops an UNKNOWN kind', () => {
    expect(normalizeBenefit({ ...valid, kind: 'free_money' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, kind: '' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, kind: undefined }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, kind: 'PERCENT' }, SPACE)).toBeNull()
  })

  it('drops an UNKNOWN scope', () => {
    expect(normalizeBenefit({ ...valid, scope: 'everything' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, scope: undefined }, SPACE)).toBeNull()
  })

  it('drops a BLANK label', () => {
    expect(normalizeBenefit({ ...valid, label: '' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, label: '   ' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, label: 42 }, SPACE)).toBeNull()
  })

  it('drops an EMPTY tier assignment', () => {
    expect(normalizeBenefit({ ...valid, tierIds: [] }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, tierIds: undefined }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, tierIds: 'tier-1' }, SPACE)).toBeNull()
    expect(normalizeBenefit({ ...valid, tierIds: ['', '  ', 7] }, SPACE)).toBeNull()
  })

  it('drops a non-object entirely', () => {
    for (const raw of [null, undefined, 'benefit', 7, true, []]) {
      expect(normalizeBenefit(raw, SPACE)).toBeNull()
    }
  })

  it('de-duplicates the tier assignment and drops non-string entries', () => {
    const n = normalizeBenefit({ ...valid, tierIds: [TIER, TIER, OTHER_TIER, '', null] }, SPACE)
    expect(n!.tierIds).toEqual([TIER, OTHER_TIER])
  })

  it('clamps a percent to 100% and an amount to the cents ceiling', () => {
    expect(normalizeBenefit({ ...valid, kind: 'percent', value: 999_999 }, SPACE)!.value).toBe(10_000)
    expect(normalizeBenefit({ ...valid, kind: 'percent', value: -20 }, SPACE)!.value).toBe(0)
    expect(
      normalizeBenefit({ ...valid, kind: 'amount_off', value: 20_000 }, SPACE)!.value,
    ).toBe(20_000)
    expect(
      normalizeBenefit({ ...valid, kind: 'amount_off', value: 9_999_999_999 }, SPACE)!.value,
    ).toBe(valueCeilingFor('amount_off'))
  })

  it('stores 0 for `included` rather than a stale rate', () => {
    expect(normalizeBenefit({ ...valid, kind: 'included', value: 1500 }, SPACE)!.value).toBe(0)
  })

  it('trims and caps the label, and keeps the buyer-facing text', () => {
    expect(normalizeBenefit({ ...valid, label: '  15% off  ' }, SPACE)!.label).toBe('15% off')
    expect(normalizeBenefit({ ...valid, label: 'x'.repeat(500) }, SPACE)!.label).toHaveLength(80)
  })

  it('only an explicit isActive:false turns a benefit off', () => {
    expect(normalizeBenefit({ ...valid, isActive: false }, SPACE)!.isActive).toBe(false)
    expect(normalizeBenefit({ ...valid, isActive: undefined }, SPACE)!.isActive).toBe(true)
    expect(normalizeBenefit({ ...valid, isActive: 0 }, SPACE)!.isActive).toBe(true)
  })

  it('normalizes maxUses + period, failing OPEN to uncapped on a malformed cap', () => {
    expect(normalizeBenefit({ ...valid, maxUses: 3, period: 'month' }, SPACE)).toMatchObject({
      maxUses: 3,
      period: 'month',
    })
    expect(normalizeBenefit({ ...valid, maxUses: 0 }, SPACE)!.maxUses).toBeNull()
    expect(normalizeBenefit({ ...valid, maxUses: -5 }, SPACE)!.maxUses).toBeNull()
    expect(normalizeBenefit({ ...valid, maxUses: 'lots' }, SPACE)!.maxUses).toBeNull()
    expect(normalizeBenefit({ ...valid, period: 'week' }, SPACE)!.period).toBeNull()
  })

  it('keeps a real id and drops a blank one (a draft has none)', () => {
    expect(normalizeBenefit({ ...valid, id: 'benefit-1' }, SPACE)!.id).toBe('benefit-1')
    expect(normalizeBenefit({ ...valid, id: '' }, SPACE)!.id).toBeUndefined()
    expect(normalizeBenefit({ ...valid, id: 7 }, SPACE)!.id).toBeUndefined()
  })

  it('always stamps the spaceId the SERVER passed, never one from the payload', () => {
    const n = normalizeBenefit({ ...valid, spaceId: 'space-somebody-else' }, SPACE)
    expect(n!.spaceId).toBe(SPACE)
  })

  it('a normalized row round-trips through the resolver', () => {
    const n = normalizeBenefit({ ...valid, id: 'benefit-1' }, SPACE)!
    expect(payableCents([n], ctx({ listCents: 10_000 })).amountCents).toBe(8500)
  })
})

// ── periodKeyFor (pure, lives in the IO module) ─────────────────────────────────────────────────

describe('periodKeyFor — the redemption bucket', () => {
  it('a monthly cap counts against YYYY-MM', () => {
    expect(periodKeyFor('month', '2026-03-21T12:00:00.000Z')).toBe('2026-03')
    expect(periodKeyFor('month', '2026-01-01T00:00:00.000Z')).toBe('2026-01')
    expect(periodKeyFor('month', '2026-12-31T23:59:59.000Z')).toBe('2026-12')
  })

  it('a yearly cap counts against YYYY', () => {
    expect(periodKeyFor('year', '2026-03-21T12:00:00.000Z')).toBe('2026')
    expect(periodKeyFor('year', '2027-01-01T00:00:00.000Z')).toBe('2027')
  })

  it('no period is a lifetime total', () => {
    expect(periodKeyFor(null, '2026-03-21T12:00:00.000Z')).toBe('lifetime')
  })

  it('is computed in UTC, so the bucket does not depend on where the server runs', () => {
    // The same instant, written three ways.
    expect(periodKeyFor('month', '2026-04-01T00:30:00.000Z')).toBe('2026-04')
    expect(periodKeyFor('month', '2026-03-31T21:30:00.000-03:00')).toBe('2026-04')
    expect(periodKeyFor('month', '2026-04-01T09:30:00.000+09:00')).toBe('2026-04')
  })

  it('FAILS CLOSED to the lifetime bucket on an unreadable clock', () => {
    for (const bad of ['', 'yesterday', 'not-a-date', '2026-13-45T99:99:99Z']) {
      expect(periodKeyFor('month', bad)).toBe('lifetime')
      expect(periodKeyFor('year', bad)).toBe('lifetime')
    }
  })

  it('zero-pads the month so the key sorts lexically', () => {
    const keys = [
      periodKeyFor('month', '2026-09-01T00:00:00.000Z'),
      periodKeyFor('month', '2026-10-01T00:00:00.000Z'),
    ]
    expect(keys).toEqual(['2026-09', '2026-10'])
    expect([...keys].sort()).toEqual(keys)
  })
})

// ── planBenefitSetOps (pure, lives in the IO module) ────────────────────────────────────────────

describe('planBenefitSetOps — benefit ids survive an edit', () => {
  it('an incoming benefit carrying an EXISTING id updates in place', () => {
    const plan = planBenefitSetOps(['b-1', 'b-2'], [benefit({ id: 'b-1' }), benefit({ id: 'b-2' })])
    expect(plan.updates.map((b) => b.id)).toEqual(['b-1', 'b-2'])
    expect(plan.inserts).toHaveLength(0)
    expect(plan.deleteIds).toEqual([])
  })

  it('a benefit with no id is an insert', () => {
    const plan = planBenefitSetOps(['b-1'], [benefit({ id: 'b-1' }), benefit({ id: undefined })])
    expect(plan.updates.map((b) => b.id)).toEqual(['b-1'])
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].id).toBeUndefined()
  })

  it('an id that is NOT a current row of this Space is treated as an insert, id dropped', () => {
    const plan = planBenefitSetOps(['b-1'], [benefit({ id: 'b-from-another-space' })])
    expect(plan.updates).toHaveLength(0)
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].id).toBeUndefined()
    expect(plan.deleteIds).toEqual(['b-1'])
  })

  it('a duplicated id claims the row once; the second copy becomes a fresh insert', () => {
    const plan = planBenefitSetOps(['b-1'], [benefit({ id: 'b-1' }), benefit({ id: 'b-1' })])
    expect(plan.updates).toHaveLength(1)
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].id).toBeUndefined()
    expect(plan.deleteIds).toEqual([])
  })

  it('a removed benefit is deleted, and the ones that stayed keep their ids', () => {
    const plan = planBenefitSetOps(['b-1', 'b-2', 'b-3'], [benefit({ id: 'b-2' })])
    expect(plan.updates.map((b) => b.id)).toEqual(['b-2'])
    expect(plan.deleteIds).toEqual(['b-1', 'b-3'])
  })

  it('an EMPTY list clears every benefit — a valid "no benefits" state', () => {
    const plan = planBenefitSetOps(['b-1', 'b-2'], [])
    expect(plan.updates).toHaveLength(0)
    expect(plan.inserts).toHaveLength(0)
    expect(plan.deleteIds).toEqual(['b-1', 'b-2'])
  })

  it('reordering the same benefits never churns an id', () => {
    const forward = planBenefitSetOps(
      ['b-1', 'b-2', 'b-3'],
      [benefit({ id: 'b-1' }), benefit({ id: 'b-2' }), benefit({ id: 'b-3' })],
    )
    const reversed = planBenefitSetOps(
      ['b-1', 'b-2', 'b-3'],
      [benefit({ id: 'b-3' }), benefit({ id: 'b-2' }), benefit({ id: 'b-1' })],
    )
    expect(forward.inserts).toHaveLength(0)
    expect(reversed.inserts).toHaveLength(0)
    expect(forward.deleteIds).toEqual([])
    expect(reversed.deleteIds).toEqual([])
    expect([...reversed.updates.map((b) => b.id)].sort()).toEqual(['b-1', 'b-2', 'b-3'])
  })
})
