import { describe, expect, it } from 'vitest'
import { meetupParts } from './meetup-when'

// 2026-10-27 12:00 UTC is 05:00 in the community's zone: still the 27th.
const now = new Date('2026-10-27T12:00:00Z')

describe('meetupParts', () => {
  it('splits a meetup into card and detail pieces', () => {
    expect(meetupParts('2026-10-28T06:15:00Z', now)).toEqual({ weekday: 'Wed', day: 28, time: '6:15am', when: 'Tomorrow · Wed, Oct 28' })
  })
  it('says Today for the same day and a plain date after that', () => {
    expect(meetupParts('2026-10-27T18:00:00Z', now).when).toBe('Today · Tue, Oct 27')
    expect(meetupParts('2026-11-03T06:15:00Z', now).when).toBe('Tue, Nov 3')
  })
  it('drops minutes on the hour and survives a bad date', () => {
    expect(meetupParts('2026-10-30T07:00:00Z', now).time).toBe('7am')
    expect(meetupParts('nope', now)).toEqual({ weekday: '', day: 0, time: '', when: '' })
  })
})
