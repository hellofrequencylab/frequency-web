import { describe, it, expect } from 'vitest'
import { computeSignature, PILLAR_KEYS } from '@/lib/frequency-signature'

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
})
