import { describe, it, expect } from 'vitest'
import { scorePosterCounts } from './poster-quality'

// The honesty metric is the anti-spam core, so its band/multiplier math is locked
// by fixtures. Evaluation order matters: punitive bands (throttled, watch) win
// before lenient ones, so a high-volume low-engagement poster is throttled even
// though they would otherwise read as "new" or "neutral".

describe('scorePosterCounts', () => {
  it('new: under 3 posts always rides at full multiplier', () => {
    const q = scorePosterCounts({ posted: 2, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('new')
    expect(q.multiplier).toBe(1.0)
  })

  it('new: a single post with zero engagement is still new, not punished', () => {
    const q = scorePosterCounts({ posted: 1, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('new')
    expect(q.multiplier).toBe(1.0)
  })

  it('trusted: engagementRate >= 0.5 earns full', () => {
    const q = scorePosterCounts({ posted: 4, engaged: 2, claimed: 0, removed: 0 })
    expect(q.engagementRate).toBeCloseTo(0.5)
    expect(q.band).toBe('trusted')
    expect(q.multiplier).toBe(1.0)
  })

  it('trusted: claim ratio >= 0.25 earns full even with low RSVP rate', () => {
    // 4 posted, 1 claimed (0.25), only that one engaged (rate 0.25 < 0.5) → trusted via claims.
    const q = scorePosterCounts({ posted: 4, engaged: 1, claimed: 1, removed: 0 })
    expect(q.band).toBe('trusted')
    expect(q.multiplier).toBe(1.0)
  })

  it('neutral: 0.2 <= rate < 0.5 with no strong claim signal stays at full but neutral', () => {
    // 5 posted, but rate must be >= 0.2 to dodge "watch": 2/5 = 0.4.
    const q = scorePosterCounts({ posted: 5, engaged: 2, claimed: 0, removed: 0 })
    expect(q.band).toBe('neutral')
    expect(q.multiplier).toBe(1.0)
  })

  it('watch: posted >= 5 and rate < 0.2 is halved', () => {
    const q = scorePosterCounts({ posted: 6, engaged: 1, claimed: 0, removed: 0 })
    expect(q.engagementRate).toBeCloseTo(1 / 6)
    expect(q.band).toBe('watch')
    expect(q.multiplier).toBe(0.5)
  })

  it('throttled: posted >= 8 and rate < 0.1 earns nothing', () => {
    const q = scorePosterCounts({ posted: 10, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('throttled')
    expect(q.multiplier).toBe(0.0)
  })

  it('throttled: two or more removed events zeroes the multiplier regardless of volume', () => {
    const q = scorePosterCounts({ posted: 3, engaged: 3, claimed: 1, removed: 2 })
    expect(q.band).toBe('throttled')
    expect(q.multiplier).toBe(0.0)
  })

  it('clamps and floors negative / fractional inputs', () => {
    const q = scorePosterCounts({ posted: -5, engaged: 2.9, claimed: -1, removed: 0 })
    expect(q.posted).toBe(0)
    expect(q.engaged).toBe(2)
    expect(q.claimed).toBe(0)
    // posted floored to 0 → under 3 → new.
    expect(q.band).toBe('new')
  })
})
