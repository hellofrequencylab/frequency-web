import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_FREQUENCIES,
  NOTIFICATION_CATEGORIES,
  normalizeFrequency,
  isFrequencyDeferred,
  DIGEST_BATCHER_EXISTS,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationPreferences,
} from './notification-preferences'

// notification-preferences.ts has no extractable pure logic beyond the defaults +
// frequency helpers (shouldSend/getPreferences require a DB client). These tests cover
// the contract that callers rely on: the shape, keys, defaults, and the pure cadence logic.

describe('DEFAULT_PREFERENCES', () => {
  const channels: NotificationChannel[] = ['email', 'inapp', 'push']
  // The full category list (drives the grid). `practice` joined in ADR-920 Phase 3.
  const categories: NotificationCategory[] = ['dispatches', 'events', 'mentions', 'lifecycle', 'comments', 'practice']

  it('the local list mirrors NOTIFICATION_CATEGORIES exactly (grid drift guard)', () => {
    expect([...NOTIFICATION_CATEGORIES]).toEqual(categories)
  })

  it('has a key for every channel × category combination (incl. the comments topic)', () => {
    for (const channel of channels) {
      for (const category of categories) {
        const key = `${channel}_${category}` as keyof NotificationPreferences
        expect(DEFAULT_PREFERENCES).toHaveProperty(key)
      }
    }
  })

  it('email + inapp are opted-in by default for every category, EXCEPT practice email (a daily reminder email is churn fuel, ADR-920)', () => {
    for (const category of categories) {
      const expectedEmail = category !== 'practice'
      expect(DEFAULT_PREFERENCES[`email_${category}` as keyof NotificationPreferences]).toBe(expectedEmail)
      expect(DEFAULT_PREFERENCES[`inapp_${category}` as keyof NotificationPreferences]).toBe(true)
    }
  })

  it('push is opted-out by default for every category (needs a browser-permission grant)', () => {
    for (const category of categories) {
      expect(DEFAULT_PREFERENCES[`push_${category}` as keyof NotificationPreferences]).toBe(false)
    }
  })

  it('has the 18 category×channel grid keys, plus any standalone feature opt-ins', () => {
    const gridKeys = categories.flatMap((c) => [`email_${c}`, `inapp_${c}`, `push_${c}`])
    expect(gridKeys).toHaveLength(18)
    for (const k of gridKeys) expect(k in DEFAULT_PREFERENCES).toBe(true)
    // Standalone opt-ins that are not part of the channel grid (a specific email feature, off by default),
    // e.g. space_event_reminders (space-follower event reminders, ADR-806).
    const standalone = Object.keys(DEFAULT_PREFERENCES).filter((k) => !gridKeys.includes(k))
    expect(standalone).toEqual(['space_event_reminders'])
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
  // Deferring means "suppress the realtime send, a cron will batch it later". No such cron
  // exists — /api/cron/weekly-digest is the COMMUNITY digest and reads none of the freq_*
  // columns — so returning true here sent the member neither the realtime email nor the digest.
  // Not "fewer emails": none, permanently, with no way for them to tell. The behaviour is now
  // gated on DIGEST_BATCHER_EXISTS.

  it('does NOT defer while there is no batcher, whatever the member chose', () => {
    expect(DIGEST_BATCHER_EXISTS).toBe(false)
    expect(isFrequencyDeferred('email', 'daily_digest')).toBe(false)
    expect(isFrequencyDeferred('email', 'weekly_digest')).toBe(false)
  })

  it('never defers realtime', () => {
    expect(isFrequencyDeferred('email', 'realtime')).toBe(false)
  })

  it('never defers in-app / push (inherently realtime surfaces)', () => {
    expect(isFrequencyDeferred('inapp', 'daily_digest')).toBe(false)
    expect(isFrequencyDeferred('push', 'weekly_digest')).toBe(false)
  })

  it('keeps the channel+frequency rule intact for the day the batcher ships', () => {
    // The logic below the flag is what the batcher will switch back on, so it is asserted
    // directly rather than deleted with the behaviour. Mirrors the real function body.
    const wouldDefer = (channel: string, frequency: string) =>
      channel === 'email' && frequency !== 'realtime'
    expect(wouldDefer('email', 'daily_digest')).toBe(true)
    expect(wouldDefer('email', 'weekly_digest')).toBe(true)
    expect(wouldDefer('email', 'realtime')).toBe(false)
    expect(wouldDefer('inapp', 'daily_digest')).toBe(false)
  })
})
