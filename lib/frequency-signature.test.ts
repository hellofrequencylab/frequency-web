import { describe, it, expect } from 'vitest'
import {
  computeSignature,
  PILLAR_KEYS,
  TARGET_DAYS_PER_PILLAR,
} from '@/lib/frequency-signature'

describe('computeSignature', () => {
  it('is the empty signature with no activity', () => {
    const s = computeSignature({})
    expect(s.total).toBe(0)
    expect(s.dominant).toBeNull()
    expect(s.spread).toBe(0)
    expect(s.balance).toBe(0)
  })
  it('a single Pillar is a spike: axis 1, dominant set, spread 1, balance 0', () => {
    const s = computeSignature({ mind: 10 })
    expect(s.dominant).toBe('mind')
    expect(s.spread).toBe(1)
    expect(s.axes.mind).toBe(1)
    expect(s.shares.mind).toBe(1)
    expect(s.balance).toBe(0)
  })
  it('perfectly even → balance ~1, spread 4, every axis at the peak', () => {
    const s = computeSignature({ mind: 5, body: 5, spirit: 5, expression: 5 })
    expect(s.spread).toBe(4)
    expect(s.balance).toBeCloseTo(1, 5)
    for (const k of PILLAR_KEYS) {
      expect(s.axes[k]).toBe(1) // each equals the peak
      expect(s.shares[k]).toBeCloseTo(0.25, 5)
    }
  })
  it('axes normalize to the peak; shares sum to 1', () => {
    const s = computeSignature({ mind: 4, body: 2 })
    expect(s.axes.mind).toBe(1)
    expect(s.axes.body).toBe(0.5)
    const shareSum = PILLAR_KEYS.reduce((a, k) => a + s.shares[k], 0)
    expect(shareSum).toBeCloseTo(1, 5)
    expect(s.dominant).toBe('mind')
    expect(s.spread).toBe(2)
  })
  it('sanitizes negative / fractional input', () => {
    const s = computeSignature({ mind: -3, body: 2.9 })
    expect(s.counts.mind).toBe(0)
    expect(s.counts.body).toBe(2)
    expect(s.dominant).toBe('body')
  })

  it('empty signature has zero bloom and zero fill', () => {
    const s = computeSignature({})
    expect(s.fill).toBe(0)
    for (const k of PILLAR_KEYS) expect(s.bloom[k]).toBe(0)
  })

  it('bloom and fill exist (and stay bounded) without a window passed', () => {
    const s = computeSignature({ mind: 3, body: 1 })
    for (const k of PILLAR_KEYS) {
      expect(s.bloom[k]).toBeGreaterThanOrEqual(0)
      expect(s.bloom[k]).toBeLessThanOrEqual(1)
    }
    // The no-window fallback never claims "full" from raw all-time volume.
    expect(s.fill).toBeLessThan(0.85)
    expect(s.fill).toBeGreaterThan(0)
  })

  it('starts tiny: one recent day across the board is far from full', () => {
    const s = computeSignature(
      { mind: 1, body: 1, spirit: 1, expression: 1 },
      { mind: 1, body: 1, spirit: 1, expression: 1 },
    )
    expect(s.fill).toBeGreaterThan(0)
    expect(s.fill).toBeLessThan(0.35) // a single day is just a nudge
  })

  it('a full, balanced bloom: target days across all four → fill ≈ 1', () => {
    const days = TARGET_DAYS_PER_PILLAR
    const s = computeSignature(
      { mind: days, body: days, spirit: days, expression: days },
      { mind: days, body: days, spirit: days, expression: days },
    )
    expect(s.fill).toBeCloseTo(1, 5)
    for (const k of PILLAR_KEYS) expect(s.bloom[k]).toBeCloseTo(1, 5)
  })

  it('bloom is paced (concave): the first half of the days is more than half the bloom', () => {
    const half = computeSignature(
      { mind: TARGET_DAYS_PER_PILLAR },
      { mind: Math.round(TARGET_DAYS_PER_PILLAR / 2) },
    )
    // The ease front-loads early growth, so half the target days yields > half the bloom.
    expect(half.bloom.mind).toBeGreaterThan(0.5)
    expect(half.bloom.mind).toBeLessThan(1)
  })

  it('collapses toward empty as recent days drop, even with all-time volume', () => {
    const active = computeSignature(
      { mind: 50, body: 50, spirit: 50, expression: 50 },
      { mind: 7, body: 7, spirit: 7, expression: 7 },
    )
    const lapsed = computeSignature(
      { mind: 50, body: 50, spirit: 50, expression: 50 },
      { mind: 0, body: 0, spirit: 0, expression: 0 }, // all aged out of the window
    )
    expect(active.fill).toBeGreaterThan(0.9)
    expect(lapsed.fill).toBe(0) // shape collapses though all-time counts are unchanged
    // ...but identity (dominant, shares) survives the lapse.
    expect(lapsed.dominant).toBe(active.dominant)
  })

  it('imbalance fills less than balance for the same total recent days', () => {
    const totalDays = 16
    const balanced = computeSignature(
      { mind: 4, body: 4, spirit: 4, expression: 4 },
      { mind: 4, body: 4, spirit: 4, expression: 4 },
    )
    const lopsided = computeSignature(
      { mind: totalDays, body: 0, spirit: 0, expression: 0 },
      { mind: totalDays, body: 0, spirit: 0, expression: 0 },
    )
    // Same recent-day budget, but concentrating it in one Pillar leaves the bloom emptier
    // (the curve caps each Pillar at 1, so a spike wastes days past its target).
    expect(balanced.fill).toBeGreaterThan(lopsided.fill)
    expect(lopsided.balance).toBe(0)
    expect(balanced.balance).toBeCloseTo(1, 5)
  })
})
