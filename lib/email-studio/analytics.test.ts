import { describe, it, expect } from 'vitest'
import { computeRates, type EventCounts } from './analytics'

// computeRates is the pure, zero-safe rate math behind the per-campaign panel. These tests pin
// the two things that matter: the fractions are correct, and every divide-by-zero is guarded.

const counts = (over: Partial<EventCounts> = {}): EventCounts => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  ...over,
})

describe('computeRates', () => {
  it('returns all-zero rates for all-zero counts (no NaN / Infinity)', () => {
    const r = computeRates(counts())
    expect(r).toEqual({ openRate: 0, clickRate: 0, bounceRate: 0 })
    expect(Number.isFinite(r.openRate)).toBe(true)
    expect(Number.isFinite(r.clickRate)).toBe(true)
    expect(Number.isFinite(r.bounceRate)).toBe(true)
  })

  it('computes open and click rate against DELIVERED', () => {
    const r = computeRates(counts({ sent: 100, delivered: 80, opened: 40, clicked: 20 }))
    expect(r.openRate).toBeCloseTo(0.5) // 40 / 80
    expect(r.clickRate).toBeCloseTo(0.25) // 20 / 80
  })

  it('computes bounce rate against SENT', () => {
    const r = computeRates(counts({ sent: 200, delivered: 190, bounced: 10 }))
    expect(r.bounceRate).toBeCloseTo(0.05) // 10 / 200
  })

  it('guards open/click when delivered is 0 even if opens/clicks exist', () => {
    // Defensive: a stray open with no delivery must not divide by zero.
    const r = computeRates(counts({ sent: 5, delivered: 0, opened: 3, clicked: 1 }))
    expect(r.openRate).toBe(0)
    expect(r.clickRate).toBe(0)
  })

  it('guards bounce when sent is 0', () => {
    const r = computeRates(counts({ sent: 0, bounced: 2 }))
    expect(r.bounceRate).toBe(0)
  })

  it('yields a rate of exactly 1 when every delivered mail is opened', () => {
    const r = computeRates(counts({ sent: 10, delivered: 10, opened: 10 }))
    expect(r.openRate).toBe(1)
  })

  it('keeps the three rates independent (different denominators)', () => {
    const r = computeRates(counts({ sent: 100, delivered: 50, opened: 25, clicked: 5, bounced: 10 }))
    expect(r.openRate).toBeCloseTo(0.5) // 25 / 50
    expect(r.clickRate).toBeCloseTo(0.1) // 5 / 50
    expect(r.bounceRate).toBeCloseTo(0.1) // 10 / 100
  })
})
