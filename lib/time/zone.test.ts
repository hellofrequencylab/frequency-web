import { describe, it, expect } from 'vitest'
import {
  HOME_TZ,
  isValidTimeZone,
  resolveZone,
  eventInstant,
  eventIsoWithOffset,
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

// ── eventIsoWithOffset — the only correct way to publish an event time ────────────────────────
// The convention this whole module exists for: `events.starts_at` holds a WALL CLOCK as UTC parts,
// so the raw stored string is a local time wearing a `Z`. Reading it as an instant has shipped
// twice — once in SQL (SCAN-101, the guest RSVP door closing before lunch) and once in the Event
// JSON-LD (SCAN-207, every public event's rich result advertising a time seven hours early).
describe('eventIsoWithOffset', () => {
  it('keeps the wall clock and attaches the zone offset AT THAT INSTANT', () => {
    expect(eventIsoWithOffset('2026-08-27T18:30:00Z', 'America/Los_Angeles')).toBe('2026-08-27T18:30:00-07:00')
    expect(eventIsoWithOffset('2026-12-24T18:30:00Z', 'America/Los_Angeles')).toBe('2026-12-24T18:30:00-08:00')
  })

  it('round-trips to exactly the instant eventInstant computes', () => {
    // The two functions must never disagree: one decides "has it started?", the other tells the
    // outside world when it starts. A gap between them is a page that contradicts its own markup.
    for (const [iso, tz] of [
      ['2026-08-27T18:30:00Z', 'America/Los_Angeles'],
      ['2026-12-24T18:30:00Z', 'America/Los_Angeles'],
      ['2026-08-27T18:30:00Z', 'America/New_York'],
      ['2026-03-08T02:30:00Z', 'America/Los_Angeles'], // inside the spring-forward hour
      ['2026-11-01T01:30:00Z', 'America/Los_Angeles'], // inside the fall-back repeated hour
    ] as const) {
      const published = eventIsoWithOffset(iso, tz)
      const instant = eventInstant(iso, tz)
      expect(published, `${iso} ${tz}`).toBeTruthy()
      expect(new Date(published as string).toISOString(), `${iso} ${tz}`).toBe(instant?.toISOString())
    }
  })

  it('is NOT the raw stored string — the whole point', () => {
    const iso = '2026-08-27T18:30:00Z'
    const published = eventIsoWithOffset(iso, 'America/Los_Angeles') as string
    expect(published).not.toBe(iso)
    expect(new Date(published).getTime() - new Date(iso).getTime()).toBe(7 * 60 * 60 * 1000)
  })

  it('falls back to the community zone on an absent or unknown name, like resolveZone', () => {
    for (const tz of [undefined, null, '', 'Not/AZone']) {
      expect(eventIsoWithOffset('2026-08-27T18:30:00Z', tz), `zone=${String(tz)}`).toBe('2026-08-27T18:30:00-07:00')
    }
  })

  it('returns null on empty or unparseable input so a caller can omit the field', () => {
    expect(eventIsoWithOffset(null, HOME_TZ)).toBeNull()
    expect(eventIsoWithOffset(undefined, HOME_TZ)).toBeNull()
    expect(eventIsoWithOffset('', HOME_TZ)).toBeNull()
    expect(eventIsoWithOffset('not-a-date', HOME_TZ)).toBeNull()
  })

  it('pads every field, so the string is always valid ISO 8601', () => {
    expect(eventIsoWithOffset('2026-01-02T03:04:05Z', 'America/Los_Angeles')).toBe('2026-01-02T03:04:05-08:00')
    // A zone with a half-hour offset must render the minutes, not swallow them.
    expect(eventIsoWithOffset('2026-08-27T18:30:00Z', 'Asia/Kolkata')).toBe('2026-08-27T18:30:00+05:30')
  })
})
