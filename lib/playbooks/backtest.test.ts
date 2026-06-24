import { describe, it, expect } from 'vitest'
import {
  hitRate,
  calibrationByBand,
  backtestChurn,
  BACKTEST_MIN_SAMPLES,
  EMPTY_BACKTEST,
  type ChurnSample,
} from './backtest'
import type { ChurnRisk } from '@/lib/traits/compute'

// The backtest harness PURE math (Resonance Engine Phase 3 · ADR-384). A calibrated model scores
// high; a noisy one scores low; a thin sample is honest about saying nothing.

/** Build n samples of one (predicted, dormant) shape. */
const samples = (band: ChurnRisk, dormant: boolean, n: number): ChurnSample[] =>
  Array.from({ length: n }, () => ({ predicted: band, dormant }))

describe('hitRate', () => {
  it('is 0 for an empty set (honest, not a fake 1)', () => {
    expect(hitRate([])).toBe(0)
  })

  it('a perfectly calibrated set scores 1', () => {
    const set = [...samples('high', true, 10), ...samples('low', false, 10)]
    expect(hitRate(set)).toBe(1)
  })

  it('an inverted (always wrong) set scores 0', () => {
    const set = [...samples('high', false, 10), ...samples('low', true, 10)]
    expect(hitRate(set)).toBe(0)
  })

  it('counts medium as a predicted-dormant call', () => {
    expect(hitRate(samples('medium', true, 10))).toBe(1)
    expect(hitRate(samples('medium', false, 10))).toBe(0)
  })
})

describe('calibrationByBand', () => {
  it('reports the actual dormant rate per band', () => {
    const set = [
      ...samples('high', true, 8),
      ...samples('high', false, 2), // 80% of high went dormant
      ...samples('low', false, 9),
      ...samples('low', true, 1), // 10% of low went dormant
    ]
    const cal = calibrationByBand(set)
    const high = cal.find((c) => c.band === 'high')!
    const low = cal.find((c) => c.band === 'low')!
    expect(high.count).toBe(10)
    expect(high.actualDormantRate).toBeCloseTo(0.8)
    expect(low.count).toBe(10)
    expect(low.actualDormantRate).toBeCloseTo(0.1)
  })

  it('a band with no members reads 0, not NaN', () => {
    const cal = calibrationByBand(samples('high', true, 5))
    const medium = cal.find((c) => c.band === 'medium')!
    expect(medium.count).toBe(0)
    expect(medium.actualDormantRate).toBe(0)
  })
})

describe('backtestChurn', () => {
  it('is honest about a thin sample (below the minimum)', () => {
    const report = backtestChurn(samples('high', true, BACKTEST_MIN_SAMPLES - 1))
    expect(report.trustworthy).toBe(false)
    expect(report.verdict).toBe(EMPTY_BACKTEST.verdict)
    expect(report.samples).toBe(BACKTEST_MIN_SAMPLES - 1)
  })

  it('a calibrated model over enough samples reads strong + trustworthy', () => {
    const set = [...samples('high', true, 15), ...samples('low', false, 15)]
    const report = backtestChurn(set)
    expect(report.trustworthy).toBe(true)
    expect(report.hitRate).toBe(1)
    expect(report.verdict).toContain('held up well')
    expect(report.verdict).not.toMatch(/[–—]/)
  })

  it('a noisy model reads shaky', () => {
    // 50/50 right: half the high went dormant, half did not; same for low.
    const set = [
      ...samples('high', true, 10),
      ...samples('high', false, 10),
      ...samples('low', false, 10),
      ...samples('low', true, 10),
    ]
    const report = backtestChurn(set)
    expect(report.hitRate).toBeCloseTo(0.5)
    expect(report.verdict).toContain('shaky')
  })

  it('the empty set returns the honest empty report', () => {
    expect(backtestChurn([])).toEqual({ ...EMPTY_BACKTEST, samples: 0 })
  })
})
