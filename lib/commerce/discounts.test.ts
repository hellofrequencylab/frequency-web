import { describe, it, expect } from 'vitest'
import { allocateCents, evaluateDiscount, normalizeCode, type DiscountCode, type DiscountLine } from './discounts'

const NOW = new Date('2026-11-10T12:00:00Z')
const line = (key: string, qty: number, unitCents: number, sellerKey = 's1', currency = 'usd'): DiscountLine => ({ key, sellerKey, currency, qty, unitCents })
const pct = (bps: number, extra: Partial<DiscountCode> = {}): DiscountCode => ({ code: 'SAVE', sellerKey: 's1', discount: { kind: 'percent', bps }, ...extra })
const fixed = (cents: number, extra: Partial<DiscountCode> = {}): DiscountCode => ({ code: 'SAVE', sellerKey: 's1', discount: { kind: 'fixed', cents, currency: 'usd' }, ...extra })
const none = { redemptions: 0, buyerRedemptions: 0 }
const run = (c: DiscountCode, lines: DiscountLine[], usage = none, entered = 'save') => evaluateDiscount(entered, [c], lines, usage, NOW)

describe('allocateCents', () => {
  it('always sums exactly to the total', () => {
    for (const total of [0, 1, 7, 100, 999, 1001]) {
      for (const w of [[1, 1, 1], [333, 333, 334], [5, 0, 5], [1], [3, 1]]) {
        const parts = allocateCents(total, w)
        const sum = parts.reduce((a, b) => a + b, 0)
        expect(sum).toBe(w.some((x) => x > 0) ? total : 0)
        parts.forEach((p, i) => expect(Number.isInteger(p) && p >= 0 && (w[i] > 0 || p === 0)).toBe(true))
      }
    }
  })
  it('gives the extra cent to the larger remainder, earlier line on a tie', () => {
    expect(allocateCents(1, [1, 1])).toEqual([1, 0])
    expect(allocateCents(2, [1, 2])).toEqual([1, 1])
  })
})

describe('evaluateDiscount', () => {
  it('normalizes what the buyer typed', () => {
    expect(normalizeCode('  save ')).toBe('SAVE')
    expect(run(pct(1000), [line('a', 1, 1000)], none, '  SaVe ').ok).toBe(true)
  })
  it('refuses an unknown or empty code', () => {
    expect(run(pct(1000), [line('a', 1, 1000)], none, 'nope')).toEqual({ ok: false, reason: 'unknown-code' })
    expect(run(pct(1000), [line('a', 1, 1000)], none, '   ')).toEqual({ ok: false, reason: 'unknown-code' })
  })
  it('percent rounds down and splits exactly across lines', () => {
    const v = run(pct(1000), [line('a', 1, 333), line('b', 2, 333)])
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.subtotalCents).toBe(999)
      expect(v.discountCents).toBe(99) // floor(99.9)
      expect(Object.values(v.perLine).reduce((a, b) => a + b, 0)).toBe(99)
    }
  })
  it('never discounts below zero', () => {
    const v = run(fixed(5000), [line('a', 1, 1200)])
    expect(v.ok && v.discountCents).toBe(1200)
    const full = run(pct(10000), [line('a', 2, 500)])
    expect(full.ok && full.discountCents).toBe(1000)
  })
  it('holds the cap and the minimum spend', () => {
    expect(run(pct(5000, { maxDiscountCents: 300 }), [line('a', 1, 2000)])).toMatchObject({ ok: true, discountCents: 300 })
    expect(run(pct(5000, { minSubtotalCents: 2500 }), [line('a', 1, 2000)])).toEqual({ ok: false, reason: 'below-minimum' })
  })
  it('only touches its own seller, and refuses a cart with none of them', () => {
    const v = run(pct(1000), [line('a', 1, 1000, 's1'), line('b', 1, 5000, 's2')])
    expect(v).toMatchObject({ ok: true, subtotalCents: 1000, discountCents: 100 })
    if (v.ok) expect(Object.keys(v.perLine)).toEqual(['a'])
    expect(run(pct(1000), [line('b', 1, 5000, 's2')])).toEqual({ ok: false, reason: 'no-eligible-lines' })
  })
  it('refuses a fixed code on another currency and a mixed-currency seller cart', () => {
    expect(run(fixed(500), [line('a', 1, 1000, 's1', 'eur')])).toEqual({ ok: false, reason: 'currency-mismatch' })
    expect(run(pct(1000), [line('a', 1, 1000, 's1', 'usd'), line('b', 1, 1000, 's1', 'eur')])).toEqual({ ok: false, reason: 'currency-mismatch' })
  })
  it('checks the window and both limits', () => {
    const l = [line('a', 1, 1000)]
    expect(run(pct(1000, { startsAt: '2026-11-11T00:00:00Z' }), l)).toEqual({ ok: false, reason: 'not-started' })
    expect(run(pct(1000, { endsAt: '2026-11-10T12:00:00Z' }), l)).toEqual({ ok: false, reason: 'expired' })
    expect(run(pct(1000, { maxRedemptions: 5 }), l, { redemptions: 5, buyerRedemptions: 0 })).toEqual({ ok: false, reason: 'sold-out' })
    expect(run(pct(1000, { perBuyerLimit: 1 }), l, { redemptions: 1, buyerRedemptions: 1 })).toEqual({ ok: false, reason: 'buyer-limit' })
    expect(run(pct(1000, { maxRedemptions: 5, perBuyerLimit: 1 }), l, { redemptions: 4, buyerRedemptions: 0 }).ok).toBe(true)
  })
  it('refuses a malformed code instead of guessing', () => {
    const l = [line('a', 1, 1000)]
    expect(run(pct(0), l)).toEqual({ ok: false, reason: 'invalid-code' })
    expect(run(pct(10001), l)).toEqual({ ok: false, reason: 'invalid-code' })
    expect(run(fixed(0), l)).toEqual({ ok: false, reason: 'invalid-code' })
    expect(run(fixed(1.5), l)).toEqual({ ok: false, reason: 'invalid-code' })
  })
})
