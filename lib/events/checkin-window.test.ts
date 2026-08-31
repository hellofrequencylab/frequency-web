import { describe, it, expect } from 'vitest'
import { checkInWindowOpen, CHECK_IN_GRACE_HOURS, CHECK_IN_CLOSED_NOTE } from './checkin-window'

// The check-in door's TIME window. Before ADR-1175 there was no upper bound anywhere: a member
// marked going could check in to an event that ended in March and collect Zaps, an attendance
// streak tick and verified-member standing for it.
//
// Stored times are the event's WALL CLOCK in UTC parts, so `T10:00:00.000Z` means 10:00 in the
// event's own zone. 10:00–12:00 LA on 2026-09-02 (PDT, UTC-7) is 17:00–19:00Z, and the door shuts
// four hours later, at 23:00Z.

const LA = 'America/Los_Angeles'
const STARTS = '2026-09-02T10:00:00.000Z'
const ENDS = '2026-09-02T12:00:00.000Z'
const at = (utc: string) => new Date(utc)

describe('checkInWindowOpen', () => {
  it('is SHUT before the event starts', () => {
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T16:59:00Z'))).toBe(false)
  })

  it('opens at the start instant, resolved in the event’s own zone', () => {
    // The zone is the point: reading the stored string as a true instant opened the door (and paid
    // Zaps) seven hours early for a PT event.
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T10:00:00Z'))).toBe(false)
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T17:00:00Z'))).toBe(true)
  })

  it('stays open through the event', () => {
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T18:00:00Z'))).toBe(true)
  })

  it('stays open through the grace period after the end', () => {
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T19:30:00Z'))).toBe(true)
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T22:59:00Z'))).toBe(true)
  })

  it('SHUTS once the grace period is spent — the bound that did not exist', () => {
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T23:00:00Z'))).toBe(false)
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-03T09:00:00Z'))).toBe(false)
    // The case that actually shipped: months later, still payable.
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-12-25T00:00:00Z'))).toBe(false)
  })

  it('measures the grace from the START when the host set no end time', () => {
    expect(checkInWindowOpen(STARTS, null, LA, at('2026-09-02T20:59:00Z'))).toBe(true)
    expect(checkInWindowOpen(STARTS, null, LA, at('2026-09-02T21:00:00Z'))).toBe(false)
  })

  it('treats an ends_at BEFORE the start as a bad row, not a zero-length event', () => {
    // Falling back to the start keeps a gathering that is happening right now checkable.
    expect(checkInWindowOpen(STARTS, '2026-09-01T12:00:00.000Z', LA, at('2026-09-02T17:30:00Z'))).toBe(true)
    expect(checkInWindowOpen(STARTS, '2026-09-01T12:00:00.000Z', LA, at('2026-09-02T21:00:00Z'))).toBe(false)
  })

  it('is CLOSED when the start cannot be read — an unplaceable check-in is not paid', () => {
    expect(checkInWindowOpen(null, ENDS, LA, at('2026-09-02T18:00:00Z'))).toBe(false)
    expect(checkInWindowOpen('sometime', ENDS, LA, at('2026-09-02T18:00:00Z'))).toBe(false)
  })

  it('honours the zone: the same wall clock is a different instant elsewhere', () => {
    // 10:00 London = 09:00Z, so the door is already open there while LA is still hours away.
    expect(checkInWindowOpen(STARTS, ENDS, 'Europe/London', at('2026-09-02T09:30:00Z'))).toBe(true)
    expect(checkInWindowOpen(STARTS, ENDS, LA, at('2026-09-02T09:30:00Z'))).toBe(false)
  })

  it('falls back to the community zone for a bogus zone rather than throwing', () => {
    expect(() => checkInWindowOpen(STARTS, ENDS, null, at('2026-09-02T18:00:00Z'))).not.toThrow()
    expect(checkInWindowOpen(STARTS, ENDS, 'Mars/Olympus_Mons', at('2026-09-02T18:00:00Z'))).toBe(true)
  })

  it('the grace is the documented four hours', () => {
    expect(CHECK_IN_GRACE_HOURS).toBe(4)
  })
})

describe('the reader-facing line', () => {
  it('has no em dashes (docs/CONTENT-VOICE.md §10)', () => {
    expect(CHECK_IN_CLOSED_NOTE).not.toMatch(/—/)
  })
})
