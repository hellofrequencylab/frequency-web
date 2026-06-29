import { describe, it, expect } from 'vitest'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  withSpotlightEnabled,
  withSpotlightPublished,
} from './spotlight-flags'

describe('spotlight-flags', () => {
  it('defaults to false for null / undefined / empty / missing key', () => {
    for (const m of [null, undefined, {}, { spotlight: {} }, { other: 1 }]) {
      expect(readSpotlightEnabled(m)).toBe(false)
      expect(readSpotlightPublished(m)).toBe(false)
    }
  })

  it('reads true only for an explicit boolean true (no coercion)', () => {
    expect(readSpotlightEnabled({ spotlight: { enabled: true } })).toBe(true)
    expect(readSpotlightEnabled({ spotlight: { enabled: 1 } })).toBe(false)
    expect(readSpotlightEnabled({ spotlight: { enabled: 'true' } })).toBe(false)
    expect(readSpotlightPublished({ spotlight: { published: true } })).toBe(true)
  })

  it('round-trips write → read', () => {
    expect(readSpotlightEnabled(withSpotlightEnabled({}, true))).toBe(true)
    expect(readSpotlightEnabled(withSpotlightEnabled({}, false))).toBe(false)
    expect(readSpotlightPublished(withSpotlightPublished({}, true))).toBe(true)
  })

  it('preserves sibling meta keys when merging (no clobber)', () => {
    const meta = { daily_checkin_date: '2026-06-27', practiceStreak: 7, spotlight: { published: true } }
    const next = withSpotlightEnabled(meta, true)
    expect(next.daily_checkin_date).toBe('2026-06-27')
    expect(next.practiceStreak).toBe(7)
    expect(readSpotlightEnabled(next)).toBe(true)
    // enabling must not touch the published flag
    expect(readSpotlightPublished(next)).toBe(true)
  })

  it('enabled and published are independent', () => {
    const m1 = withSpotlightEnabled({}, true)
    expect(readSpotlightEnabled(m1)).toBe(true)
    expect(readSpotlightPublished(m1)).toBe(false)
  })
})
