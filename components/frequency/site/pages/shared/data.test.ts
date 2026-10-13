import { describe, expect, it } from 'vitest'
import { eventWhen } from './data'

// starts_at stores the host's wall clock as UTC parts (lib/utils, "Event date formatting"), so a
// 7:00 PM Thursday event is ...T19:00:00Z and must read "Thu 7:00pm" on every runtime.
describe('eventWhen', () => {
  it('reads the stored wall clock, in the design’s "Thu 7:00pm" shape', () => {
    expect(eventWhen('2026-10-15T19:00:00Z')).toBe('Thu 7:00pm')
    expect(eventWhen('2026-10-17T08:30:00.000Z')).toBe('Sat 8:30am')
  })

  it('never shifts the day across midnight UTC', () => {
    expect(eventWhen('2026-10-16T00:15:00Z')).toBe('Fri 12:15am')
  })

  it('returns nothing for an unreadable date rather than "Invalid Date"', () => {
    expect(eventWhen('not a date')).toBe('')
  })
})
