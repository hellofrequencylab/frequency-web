import { describe, it, expect } from 'vitest'
import {
  wallClockToIso,
  dateToWallClockIso,
  isoToWallClockInput,
  eventStartInputToIso,
} from './datetime'

describe('wallClockToIso', () => {
  it('keeps the wall-clock literally as UTC (no offset shift)', () => {
    // 7:00 PM stays 19:00, regardless of the runtime timezone.
    expect(wallClockToIso('2026-06-26T19:00')).toBe('2026-06-26T19:00:00.000Z')
  })

  it('accepts a value that already has seconds', () => {
    expect(wallClockToIso('2026-06-26T19:00:30')).toBe('2026-06-26T19:00:30.000Z')
  })

  it('returns null for empty or invalid input', () => {
    expect(wallClockToIso('')).toBeNull()
    expect(wallClockToIso(null)).toBeNull()
    expect(wallClockToIso('not-a-date')).toBeNull()
  })
})

describe('dateToWallClockIso', () => {
  it('pins a date-only value to midnight UTC (no day rollback)', () => {
    expect(dateToWallClockIso('2026-07-01')).toBe('2026-07-01T00:00:00.000Z')
  })

  it('returns null for empty input', () => {
    expect(dateToWallClockIso('')).toBeNull()
    expect(dateToWallClockIso(null)).toBeNull()
  })
})

describe('eventStartInputToIso', () => {
  it('keeps a datetime-local wall-clock literally (the storage convention)', () => {
    // The journey-runs bug this pins down: new Date('2026-06-26T19:00').toISOString()
    // parses a tz-LESS string in the SERVER's zone — right only because prod Node is UTC.
    expect(eventStartInputToIso('2026-06-26T19:00')).toBe('2026-06-26T19:00:00.000Z')
  })

  it('passes an explicit-offset ISO through unchanged (already an exact instant)', () => {
    expect(eventStartInputToIso('2026-06-26T19:00:00.000Z')).toBe('2026-06-26T19:00:00.000Z')
    expect(eventStartInputToIso('2026-06-26T19:00:00+02:00')).toBe('2026-06-26T17:00:00.000Z')
  })

  it('rejects any OTHER tz-less shape instead of parsing it in the server zone', () => {
    expect(eventStartInputToIso('2026-06-26 19:00')).toBeNull()
    expect(eventStartInputToIso('not-a-date')).toBeNull()
    expect(eventStartInputToIso('')).toBeNull()
    expect(eventStartInputToIso(null)).toBeNull()
  })
})

describe('isoToWallClockInput', () => {
  it('round-trips a stored instant back to the same wall-clock via UTC parts', () => {
    expect(isoToWallClockInput('2026-06-26T19:00:00.000Z')).toBe('2026-06-26T19:00')
  })

  it('is the exact inverse of wallClockToIso', () => {
    const local = '2026-12-31T23:30'
    expect(isoToWallClockInput(wallClockToIso(local))).toBe(local)
  })

  it('returns empty string for null/invalid', () => {
    expect(isoToWallClockInput(null)).toBe('')
    expect(isoToWallClockInput('nope')).toBe('')
  })
})
