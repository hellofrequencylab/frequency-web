import { describe, it, expect } from 'vitest'
import {
  declineSlope,
  notificationBudgetTier,
  computeRetentionTraits,
} from './compute'

// Resonance Engine Phase 5 (ADR-386): the two retention signals the winback + dunning
// playbooks key on. Pure + deterministic; this pins the band edges + the fail-safe-toward-
// restraint behavior, so a malformed input can never read a member as more reachable than
// they are, and the slope never leaves [0, 1].

describe('declineSlope', () => {
  it('is 0 with no prior-week baseline (never divides by zero)', () => {
    expect(declineSlope({ practiceThisWeek: 0, practiceLastWeek: 0 })).toBe(0)
    expect(declineSlope({ practiceThisWeek: 3, practiceLastWeek: 0 })).toBe(0)
  })

  it('is 0 when flat or climbing (not a decline)', () => {
    expect(declineSlope({ practiceThisWeek: 4, practiceLastWeek: 4 })).toBe(0)
    expect(declineSlope({ practiceThisWeek: 6, practiceLastWeek: 4 })).toBe(0)
  })

  it('measures the week-over-week drop as a fraction of last week', () => {
    expect(declineSlope({ practiceThisWeek: 2, practiceLastWeek: 4 })).toBe(0.5)
    expect(declineSlope({ practiceThisWeek: 0, practiceLastWeek: 4 })).toBe(1) // fully lapsed
    expect(declineSlope({ practiceThisWeek: 3, practiceLastWeek: 4 })).toBe(0.25)
  })

  it('stays in [0, 1] and floors malformed negative counts', () => {
    const v = declineSlope({ practiceThisWeek: -5, practiceLastWeek: 4 })
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
    expect(v).toBe(1) // -5 floored to 0 -> fully lapsed
  })
})

describe('notificationBudgetTier', () => {
  it('defaults to standard when nothing is set', () => {
    expect(notificationBudgetTier({})).toBe('standard')
  })

  it('pauses when the member wants no outbound (the strongest restraint wins)', () => {
    expect(notificationBudgetTier({ suppressed: true })).toBe('paused')
    expect(notificationBudgetTier({ preferredChannel: 'none' })).toBe('paused')
    expect(notificationBudgetTier({ weeklyCap: 0 })).toBe('paused')
    // restraint dominates a high cap
    expect(notificationBudgetTier({ weeklyCap: 10, suppressed: true })).toBe('paused')
  })

  it('is sparing for a low cap or quiet hours', () => {
    expect(notificationBudgetTier({ weeklyCap: 1 })).toBe('sparing')
    expect(notificationBudgetTier({ quietHours: true })).toBe('sparing')
    // pause still beats sparing
    expect(notificationBudgetTier({ weeklyCap: 1, preferredChannel: 'none' })).toBe('paused')
  })

  it('is generous only for a high cap with no quiet-hours restraint', () => {
    expect(notificationBudgetTier({ weeklyCap: 5 })).toBe('generous')
    expect(notificationBudgetTier({ weeklyCap: 8, quietHours: false })).toBe('generous')
    // quiet hours pulls a high cap back to sparing (restraint wins)
    expect(notificationBudgetTier({ weeklyCap: 8, quietHours: true })).toBe('sparing')
  })

  it('treats a malformed cap as no cap (falls through to standard)', () => {
    expect(notificationBudgetTier({ weeklyCap: Number.NaN })).toBe('standard')
  })
})

describe('computeRetentionTraits', () => {
  it('emits both Phase 5 traits with the right keys + types', () => {
    const out = computeRetentionTraits(
      { practiceThisWeek: 1, practiceLastWeek: 4 },
      { weeklyCap: 1 },
    )
    expect(out).toEqual([
      { key: 'decline_slope', type: 'number', value: 0.75 },
      { key: 'notification_budget', type: 'enum', value: 'sparing' },
    ])
  })
})
