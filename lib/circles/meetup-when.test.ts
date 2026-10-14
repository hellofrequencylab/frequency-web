import { describe, expect, it } from 'vitest'
import { meetupWhen } from './meetup-when'

// "Now" is Tuesday 2026-10-13, 10:00 in Los Angeles (17:00 UTC).
const NOW = new Date('2026-10-13T17:00:00Z')

describe('meetupWhen', () => {
  it('reads today and tomorrow by the community day, from the stored wall clock', () => {
    expect(meetupWhen('2026-10-13T18:15:00Z', NOW)).toBe('Today 6:15pm')
    expect(meetupWhen('2026-10-14T06:00:00Z', NOW)).toBe('Tomorrow 6am')
  })

  it('names the weekday inside the week', () => {
    expect(meetupWhen('2026-10-16T06:15:00Z', NOW)).toBe('Fri 6:15am')
  })

  it('names the date once a bare weekday would mislead', () => {
    expect(meetupWhen('2026-10-24T08:00:00Z', NOW)).toBe('Oct 24 · 8am')
  })

  it('stays on today late in the Pacific evening, when UTC is already tomorrow', () => {
    // 2026-10-14 04:30 UTC is still 21:30 on the 13th in Los Angeles.
    expect(meetupWhen('2026-10-13T22:00:00Z', new Date('2026-10-14T04:30:00Z'))).toBe('Today 10pm')
  })

  it('never throws on a bad value', () => {
    expect(meetupWhen('not a date', NOW)).toBe('')
  })
})
