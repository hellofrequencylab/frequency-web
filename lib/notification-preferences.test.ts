import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_FREQUENCIES,
  NOTIFICATION_CATEGORIES,
  normalizeFrequency,
  isFrequencyDeferred,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationPreferences,
} from './notification-preferences'

// notification-preferences.ts has no extractable pure logic beyond the defaults +
// frequency helpers (shouldSend/getPreferences require a DB client). These tests cover
// the contract that callers rely on: the shape, keys, defaults, and the pure cadence logic.

describe('DEFAULT_PREFERENCES', () => {
  const channels: NotificationChannel[] = ['email', 'inapp', 'push']
  const categories: NotificationCategory[] = ['dispatches', 'events', 'mentions', 'lifecycle', 'comments']

  it('has a key for every channel × category combination (incl. the comments topic)', () => {
    for (const channel of channels) {
      for (const category of categories) {
        const key = `${channel}_${category}` as keyof NotificationPreferences
        expect(DEFAULT_PREFERENCES).toHaveProperty(key)
      }
    }
  })

  it('email + inapp are opted-in by default for every category', () => {
    for (const category of categories) {
      expect(DEFAULT_PREFERENCES[`email_${category}` as keyof NotificationPreferences]).toBe(true)
      expect(DEFAULT_PREFERENCES[`inapp_${category}` as keyof NotificationPreferences]).toBe(true)
    }
  })

  it('push is opted-out by default for every category (needs a browser-permission grant)', () => {
    for (const category of categories) {
      expect(DEFAULT_PREFERENCES[`push_${category}` as keyof NotificationPreferences]).toBe(false)
    }
  })

  it('has exactly 15 keys (5 categories × 3 channels)', () => {
    expect(Object.keys(DEFAULT_PREFERENCES)).toHaveLength(15)
  })

  it('all values are booleans', () => {
    for (const value of Object.values(DEFAULT_PREFERENCES)) {
      expect(typeof value).toBe('boolean')
    }
  })
})

describe('DEFAULT_FREQUENCIES', () => {
  it('defaults every category to realtime (today’s behaviour)', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(DEFAULT_FREQUENCIES[`freq_${category}`]).toBe('realtime')
    }
  })

  it('has one entry per category', () => {
    expect(Object.keys(DEFAULT_FREQUENCIES)).toHaveLength(NOTIFICATION_CATEGORIES.length)
  })
})

describe('normalizeFrequency', () => {
  it('passes through known cadences', () => {
    expect(normalizeFrequency('realtime')).toBe('realtime')
    expect(normalizeFrequency('daily_digest')).toBe('daily_digest')
    expect(normalizeFrequency('weekly_digest')).toBe('weekly_digest')
  })

  it('coerces anything unknown to realtime (never widens delivery)', () => {
    expect(normalizeFrequency('bogus')).toBe('realtime')
    expect(normalizeFrequency(undefined)).toBe('realtime')
    expect(normalizeFrequency(null)).toBe('realtime')
    expect(normalizeFrequency(42)).toBe('realtime')
  })
})

describe('isFrequencyDeferred', () => {
  it('defers a digest choice on email only', () => {
    expect(isFrequencyDeferred('email', 'daily_digest')).toBe(true)
    expect(isFrequencyDeferred('email', 'weekly_digest')).toBe(true)
  })

  it('never defers realtime', () => {
    expect(isFrequencyDeferred('email', 'realtime')).toBe(false)
  })

  it('never defers in-app / push (inherently realtime surfaces)', () => {
    expect(isFrequencyDeferred('inapp', 'daily_digest')).toBe(false)
    expect(isFrequencyDeferred('push', 'weekly_digest')).toBe(false)
  })
})
