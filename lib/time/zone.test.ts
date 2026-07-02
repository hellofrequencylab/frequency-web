import { describe, it, expect } from 'vitest'
import {
  HOME_TZ,
  isValidTimeZone,
  resolveZone,
  eventInstant,
  isEventPast,
  zoneAbbrev,
  dayInZone,
  formatEventWhen,
  tzFromLatLng,
} from './zone'

describe('zone validation', () => {
  it('accepts real IANA zones, rejects junk', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
  })
  it('resolveZone falls back to HOME', () => {
    expect(resolveZone(null)).toBe(HOME_TZ)
    expect(resolveZone('garbage')).toBe(HOME_TZ)
    expect(resolveZone('America/New_York')).toBe('America/New_York')
  })
})

describe('eventInstant — stored wall-clock + zone -> true UTC instant', () => {
  // 7:00 PM stored as UTC parts.
  const stored = '2026-07-01T19:00:00Z'
  it('LA in July (PDT, UTC-7): 7pm local -> 02:00Z next day', () => {
    expect(eventInstant(stored, 'America/Los_Angeles')!.toISOString()).toBe('2026-07-02T02:00:00.000Z')
  })
  it('New York in July (EDT, UTC-4): 7pm local -> 23:00Z same day', () => {
    expect(eventInstant(stored, 'America/New_York')!.toISOString()).toBe('2026-07-01T23:00:00.000Z')
  })
  it('winter DST boundary — LA in January (PST, UTC-8)', () => {
    expect(eventInstant('2026-01-15T19:00:00Z', 'America/Los_Angeles')!.toISOString()).toBe('2026-01-16T03:00:00.000Z')
  })
  it('null/invalid input -> null', () => {
    expect(eventInstant(null, 'UTC')).toBeNull()
    expect(eventInstant('nonsense', 'UTC')).toBeNull()
  })
})

describe('isEventPast — compares the true instant, not the raw wall-clock', () => {
  const stored = '2026-07-01T19:00:00Z' // 7pm
  it('a 7pm LA event is NOT past at 12:01pm LA (19:01Z) — the old bug', () => {
    // 19:01Z is 12:01 PM PDT; the event (02:00Z next day) is 7 hours away.
    const now = new Date('2026-07-01T19:01:00Z')
    expect(isEventPast(stored, null, 'America/Los_Angeles', now)).toBe(false)
  })
  it('is past once the true instant passes', () => {
    const now = new Date('2026-07-02T02:30:00Z')
    expect(isEventPast(stored, null, 'America/Los_Angeles', now)).toBe(true)
  })
  it('uses ends_at when present', () => {
    const now = new Date('2026-07-02T02:30:00Z')
    // starts 7pm, ends 10pm (05:00Z next day) -> still not past at 02:30Z.
    expect(isEventPast(stored, '2026-07-01T22:00:00Z', null, now)).toBe(false)
  })
})

describe('zoneAbbrev', () => {
  it('PDT in summer, PST in winter', () => {
    expect(zoneAbbrev('2026-07-01T19:00:00Z', 'America/Los_Angeles')).toBe('PDT')
    expect(zoneAbbrev('2026-01-15T19:00:00Z', 'America/Los_Angeles')).toBe('PST')
  })
})

describe('formatEventWhen', () => {
  const stored = '2026-07-01T19:00:00Z'
  it('renders the event-local wall clock with the zone abbrev', () => {
    const out = formatEventWhen(stored, 'America/Los_Angeles', { style: 'time' })
    expect(out).toBe('7:00 PM PDT')
  })
  it('converts to a viewer zone when asked', () => {
    // 7pm LA (PDT) == 10pm New York (EDT).
    const out = formatEventWhen(stored, 'America/Los_Angeles', { style: 'time', viewerTz: 'America/New_York' })
    expect(out).toBe('10:00 PM EDT')
  })
  it('empty in -> empty out', () => {
    expect(formatEventWhen(null, 'UTC')).toBe('')
  })
})

describe('dayInZone', () => {
  it('rolls the day at LA local midnight, not UTC', () => {
    // 2026-07-02T05:00Z is 10pm July 1 in LA.
    expect(dayInZone(new Date('2026-07-02T05:00:00Z'), 'America/Los_Angeles')).toBe('2026-07-01')
    expect(dayInZone(new Date('2026-07-02T05:00:00Z'), 'UTC')).toBe('2026-07-02')
  })
})

describe('tzFromLatLng', () => {
  it('maps coordinates to their IANA zone worldwide', () => {
    expect(tzFromLatLng(34.05, -118.24)).toBe('America/Los_Angeles') // LA
    expect(tzFromLatLng(40.71, -74.0)).toBe('America/New_York') // NYC
    expect(tzFromLatLng(51.51, -0.13)).toBe('Europe/London') // London
    expect(tzFromLatLng(35.68, 139.69)).toBe('Asia/Tokyo') // Tokyo
  })
  it('falls back to HOME for missing/out-of-range coordinates', () => {
    expect(tzFromLatLng(null, null)).toBe(HOME_TZ)
    expect(tzFromLatLng(999, 999)).toBe(HOME_TZ)
  })
})
