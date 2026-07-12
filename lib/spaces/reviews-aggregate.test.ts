import { describe, it, expect } from 'vitest'
import { computeReviewAggregate } from './reviews-aggregate'

// PURE review-aggregate math (Reviews redesign). Locks the three numbers the Reviews page renders:
// the one-decimal average, the count, and the per-star distribution, plus the fail-safe on empty /
// malformed input.

describe('computeReviewAggregate', () => {
  it('derives the average (one decimal), count, and per-star distribution', () => {
    const out = computeReviewAggregate([5, 4, 5, 3, 5])
    expect(out.count).toBe(5)
    expect(out.average).toBe(4.4) // 22/5 = 4.4
    expect(out.distribution).toEqual({ 5: 3, 4: 1, 3: 1, 2: 0, 1: 0 })
  })

  it('rounds the average to one decimal', () => {
    expect(computeReviewAggregate([5, 4, 4]).average).toBe(4.3) // 13/3 = 4.333 -> 4.3
  })

  it('is empty-safe: null average, 0 count, all-zero distribution', () => {
    expect(computeReviewAggregate([])).toEqual({
      average: null,
      count: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    })
  })

  it('ignores ratings outside 1..5 (malformed rows never skew the bars or average)', () => {
    const out = computeReviewAggregate([5, 0, 6, 3, -1, 2.9])
    expect(out.count).toBe(3) // 5, 3, and trunc(2.9)=2
    expect(out.distribution).toEqual({ 5: 1, 4: 0, 3: 1, 2: 1, 1: 0 })
    expect(out.average).toBe(3.3) // 10/3 = 3.33 -> 3.3
  })
})
