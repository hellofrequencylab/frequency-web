import { describe, it, expect } from 'vitest'
import {
  readRsvpWindow,
  rsvpWindowState,
  rsvpWindowStateFromDetails,
  rsvpWindowNote,
  NO_RSVP_WINDOW,
} from './rsvp-window'

// The booking window a host sets in event settings. It has been written and displayed since it
// shipped and enforced by nothing; these are the rules that make it real (ADR-1174).
//
// Every stored value is the event's WALL CLOCK carried in UTC parts, the same convention
// `events.starts_at` uses — so `2026-09-02T10:00:00.000Z` means 10:00 in the EVENT's zone, not
// 10:00 UTC. The zone tests below are the ones that matter: comparing the raw string to now is the
// seven-hours-early bug ADR-1150 fixed on the guest door.

const LA = 'America/Los_Angeles'
// 2026-09-02T10:00 wall clock in LA is 17:00 UTC (PDT, UTC-7).
const OPENS = '2026-09-02T10:00:00.000Z'
const CLOSES = '2026-09-02T12:00:00.000Z'
const at = (utc: string) => new Date(utc)

describe('readRsvpWindow', () => {
  it('reads a full window off a details bag', () => {
    expect(readRsvpWindow({ rsvpWindow: { opensAt: OPENS, closesAt: CLOSES } })).toEqual({
      opensAt: OPENS,
      closesAt: CLOSES,
    })
  })

  it('reads one-sided windows, which the settings form can write', () => {
    expect(readRsvpWindow({ rsvpWindow: { opensAt: OPENS, closesAt: null } }).closesAt).toBeNull()
    expect(readRsvpWindow({ rsvpWindow: { opensAt: null, closesAt: CLOSES } }).opensAt).toBeNull()
  })

  it('reads NO window from every shape an event without one can have', () => {
    // The overwhelmingly common case: the key has never been written.
    expect(readRsvpWindow({})).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow(null)).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow(undefined)).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow({ lineup: ['a'] })).toEqual(NO_RSVP_WINDOW)
    // And every malformed shape: a string bag, a string window, numbers for the sides, empties.
    expect(readRsvpWindow('nonsense')).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow({ rsvpWindow: 'soon' })).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow({ rsvpWindow: { opensAt: 17, closesAt: false } })).toEqual(NO_RSVP_WINDOW)
    expect(readRsvpWindow({ rsvpWindow: { opensAt: '', closesAt: '' } })).toEqual(NO_RSVP_WINDOW)
  })
})

describe('rsvpWindowState', () => {
  it('is open when there is no window at all — which is nearly every event', () => {
    expect(rsvpWindowState(NO_RSVP_WINDOW, LA, at('2030-01-01T00:00:00Z'))).toBe('open')
  })

  it('resolves the stored wall clock in the EVENT’s zone, not as UTC', () => {
    // 10:00 wall clock in LA = 17:00Z. At 16:00Z the window has NOT opened yet; reading the stored
    // string as a true instant would have called it open an hour early (and seven hours early at
    // the moment the raw compare flipped).
    const w = { opensAt: OPENS, closesAt: null }
    expect(rsvpWindowState(w, LA, at('2026-09-02T16:00:00Z'))).toBe('pending')
    expect(rsvpWindowState(w, LA, at('2026-09-02T17:00:01Z'))).toBe('open')
  })

  it('closes at the closing instant, in the event’s zone', () => {
    const w = { opensAt: null, closesAt: CLOSES } // 12:00 LA = 19:00Z
    expect(rsvpWindowState(w, LA, at('2026-09-02T18:59:00Z'))).toBe('open')
    expect(rsvpWindowState(w, LA, at('2026-09-02T19:00:00Z'))).toBe('closed')
  })

  it('the same wall clock in a different zone is a different instant', () => {
    // 10:00 London on that date is 09:00Z, so a moment that is still 'pending' in LA is already
    // 'open' in London. This is the whole reason the zone is a parameter.
    const w = { opensAt: OPENS, closesAt: null }
    expect(rsvpWindowState(w, 'Europe/London', at('2026-09-02T09:30:00Z'))).toBe('open')
    expect(rsvpWindowState(w, LA, at('2026-09-02T09:30:00Z'))).toBe('pending')
  })

  it('walks a two-sided window through all three states', () => {
    const w = { opensAt: OPENS, closesAt: CLOSES }
    expect(rsvpWindowState(w, LA, at('2026-09-02T16:00:00Z'))).toBe('pending')
    expect(rsvpWindowState(w, LA, at('2026-09-02T18:00:00Z'))).toBe('open')
    expect(rsvpWindowState(w, LA, at('2026-09-02T20:00:00Z'))).toBe('closed')
  })

  it('FAILS OPEN on a backwards window rather than shutting the door forever', () => {
    // A host who fat-fingers two dates must not silently lose every RSVP; nothing in here can tell
    // them, so the safe direction is to behave as though no window was set.
    const w = { opensAt: CLOSES, closesAt: OPENS }
    expect(rsvpWindowState(w, LA, at('2026-09-02T18:00:00Z'))).toBe('open')
    expect(rsvpWindowState(w, LA, at('2020-01-01T00:00:00Z'))).toBe('open')
  })

  it('FAILS OPEN on values that are not dates', () => {
    expect(rsvpWindowState({ opensAt: 'tomorrow', closesAt: null }, LA, at('2026-01-01T00:00:00Z'))).toBe('open')
    expect(rsvpWindowState({ opensAt: null, closesAt: 'never' }, LA, at('2026-01-01T00:00:00Z'))).toBe('open')
  })

  it('falls back to the community zone for a missing or bogus zone rather than throwing', () => {
    const w = { opensAt: OPENS, closesAt: null }
    expect(() => rsvpWindowState(w, null, at('2026-09-02T16:00:00Z'))).not.toThrow()
    expect(rsvpWindowState(w, 'Mars/Olympus_Mons', at('2026-09-02T16:00:00Z'))).toBe('pending')
  })
})

describe('rsvpWindowStateFromDetails', () => {
  it('is the same rule, read straight off the bag', () => {
    const details = { rsvpWindow: { opensAt: OPENS, closesAt: CLOSES } }
    expect(rsvpWindowStateFromDetails(details, LA, at('2026-09-02T18:00:00Z'))).toBe('open')
    expect(rsvpWindowStateFromDetails(details, LA, at('2026-09-02T20:00:00Z'))).toBe('closed')
    expect(rsvpWindowStateFromDetails(null, LA, at('2026-09-02T20:00:00Z'))).toBe('open')
  })
})

describe('the reader-facing line', () => {
  it('says nothing when the door is open', () => {
    expect(rsvpWindowNote('open')).toBeNull()
  })

  it('names which side of the window we are on', () => {
    expect(rsvpWindowNote('pending')).toMatch(/later/)
    expect(rsvpWindowNote('closed')).toMatch(/closed/)
  })

  it('has no em dashes (docs/CONTENT-VOICE.md §10)', () => {
    expect(rsvpWindowNote('pending')).not.toMatch(/—/)
    expect(rsvpWindowNote('closed')).not.toMatch(/—/)
  })
})
