import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationPreferences,
} from './notification-preferences'

// notification-preferences.ts has no extractable pure logic beyond DEFAULT_PREFERENCES
// (shouldSend/getPreferences require a DB client). These tests cover the contract that
// callers rely on: the shape, keys, and default values.

describe('DEFAULT_PREFERENCES', () => {
  const channels: NotificationChannel[] = ['email', 'inapp', 'push']
  const categories: NotificationCategory[] = ['dispatches', 'events', 'mentions', 'lifecycle']

  it('has a key for every channel × category combination', () => {
    for (const channel of channels) {
      for (const category of categories) {
        const key = `${channel}_${category}` as keyof NotificationPreferences
        expect(DEFAULT_PREFERENCES).toHaveProperty(key)
      }
    }
  })

  it('email is opted-in by default for all categories', () => {
    expect(DEFAULT_PREFERENCES.email_dispatches).toBe(true)
    expect(DEFAULT_PREFERENCES.email_events).toBe(true)
    expect(DEFAULT_PREFERENCES.email_mentions).toBe(true)
    expect(DEFAULT_PREFERENCES.email_lifecycle).toBe(true)
  })

  it('inapp is opted-in by default for all categories', () => {
    expect(DEFAULT_PREFERENCES.inapp_dispatches).toBe(true)
    expect(DEFAULT_PREFERENCES.inapp_events).toBe(true)
    expect(DEFAULT_PREFERENCES.inapp_mentions).toBe(true)
    expect(DEFAULT_PREFERENCES.inapp_lifecycle).toBe(true)
  })

  it('push is opted-out by default for all categories (P1.4 not yet shipped)', () => {
    expect(DEFAULT_PREFERENCES.push_dispatches).toBe(false)
    expect(DEFAULT_PREFERENCES.push_events).toBe(false)
    expect(DEFAULT_PREFERENCES.push_mentions).toBe(false)
    expect(DEFAULT_PREFERENCES.push_lifecycle).toBe(false)
  })

  it('has exactly 12 keys (4 categories × 3 channels)', () => {
    expect(Object.keys(DEFAULT_PREFERENCES)).toHaveLength(12)
  })

  it('all values are booleans', () => {
    for (const value of Object.values(DEFAULT_PREFERENCES)) {
      expect(typeof value).toBe('boolean')
    }
  })
})
