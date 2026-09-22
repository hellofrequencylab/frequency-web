import { describe, expect, it } from 'vitest'
import { shortDateLabel } from './short-date'

// LIVE-468: one short-date format on every calendar surface, matching the when-label's date style.

describe('shortDateLabel', () => {
  it('reads a day key as "Wed, Sep 23", the same shape the when-labels use', () => {
    expect(shortDateLabel('2026-09-23')).toBe('Wed, Sep 23')
    expect(shortDateLabel('2026-10-04')).toBe('Sun, Oct 4')
    expect(shortDateLabel('2027-01-01')).toBe('Fri, Jan 1')
  })

  it('takes the day from an instant by its first ten characters, as a date column reads back', () => {
    // hold_expires_at is a date written as midnight UTC; a to-do's due_at is sliced the same way.
    expect(shortDateLabel('2026-10-04T00:00:00.000Z')).toBe('Sun, Oct 4')
    expect(shortDateLabel('2026-10-04T23:30:00.000Z')).toBe('Sun, Oct 4')
  })

  it('reads a true instant in the given zone only when asked', () => {
    // 04:00Z on the 5th is still the evening of the 4th in Los Angeles.
    expect(shortDateLabel('2026-10-05T04:00:00.000Z', 'America/Los_Angeles')).toBe('Sun, Oct 4')
    expect(shortDateLabel('2026-10-05T04:00:00.000Z', 'UTC')).toBe('Mon, Oct 5')
    // A bare day key has no zone to read it in, so the zone changes nothing.
    expect(shortDateLabel('2026-10-04', 'Pacific/Auckland')).toBe('Sun, Oct 4')
  })

  it('never throws and never blanks a value it cannot read', () => {
    expect(shortDateLabel('soon')).toBe('soon')
    expect(shortDateLabel('2026-13-40')).toBe('2026-13-40')
    expect(shortDateLabel('')).toBe('')
    expect(shortDateLabel('2026-10-05T04:00:00.000Z', 'Not/AZone')).toBe('Mon, Oct 5')
  })
})
