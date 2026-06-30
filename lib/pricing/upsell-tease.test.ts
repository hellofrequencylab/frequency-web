import { describe, it, expect } from 'vitest'

// PHASE E — in-context upsell teases. The headline invariant under test: a tease shows ONLY when
// billing is LIVE, the target capability is LOCKED, and the tease is UNDER its frequency cap (not
// dismissed). While billing is OFF, no tease ever shows — nothing new appears before the flip.

import { shouldShowTease, teaseCapSpent, TEASE_DEFAULT_CAP } from './upsell-tease'

describe('shouldShowTease — the pure visibility predicate (ON + locked + under cap)', () => {
  it('OFF: never shows, regardless of locked / dismissed (the master invariant)', () => {
    expect(shouldShowTease({ billingLive: false, locked: true })).toBe(false)
    expect(shouldShowTease({ billingLive: false, locked: false })).toBe(false)
    expect(shouldShowTease({ billingLive: false, locked: true, dismissed: false })).toBe(false)
  })

  it('ON + locked + not dismissed: shows (the only positive case)', () => {
    expect(shouldShowTease({ billingLive: true, locked: true })).toBe(true)
    expect(shouldShowTease({ billingLive: true, locked: true, dismissed: false })).toBe(true)
  })

  it('ON but UNLOCKED: never shows (they already have the capability — no upsell)', () => {
    expect(shouldShowTease({ billingLive: true, locked: false })).toBe(false)
    expect(shouldShowTease({ billingLive: true, locked: false, dismissed: false })).toBe(false)
  })

  it('ON + locked but DISMISSED / capped: never shows (never nag)', () => {
    expect(shouldShowTease({ billingLive: true, locked: true, dismissed: true })).toBe(false)
  })
})

describe('teaseCapSpent — the frequency-cap arithmetic (never nag)', () => {
  it('the default cap is one gentle nudge', () => {
    expect(TEASE_DEFAULT_CAP).toBe(1)
  })

  it('under the cap reads as not-spent; at/over reads as spent', () => {
    expect(teaseCapSpent(0)).toBe(false)
    expect(teaseCapSpent(1)).toBe(true) // hit the default cap of 1
    expect(teaseCapSpent(1, 3)).toBe(false)
    expect(teaseCapSpent(3, 3)).toBe(true)
    expect(teaseCapSpent(5, 3)).toBe(true)
  })

  it('a non-positive cap means no cap (always under)', () => {
    expect(teaseCapSpent(99, 0)).toBe(false)
    expect(teaseCapSpent(99, -1)).toBe(false)
  })

  it('garbage / null seen counts read as zero (fail to not-spent)', () => {
    expect(teaseCapSpent(null)).toBe(false)
    expect(teaseCapSpent(undefined)).toBe(false)
    expect(teaseCapSpent(-4)).toBe(false)
    expect(teaseCapSpent(NaN)).toBe(false)
  })

  it('the cap result threads into the predicate as `dismissed` (capped → no show)', () => {
    const seen = 1
    expect(shouldShowTease({ billingLive: true, locked: true, dismissed: teaseCapSpent(seen) })).toBe(false)
    expect(shouldShowTease({ billingLive: true, locked: true, dismissed: teaseCapSpent(0) })).toBe(true)
  })
})
