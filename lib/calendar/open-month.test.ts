import { describe, expect, it } from 'vitest'
import { openingMonth } from './open-month'

// The clock is passed in, never read: "now" is the instant under test.
const OCT_28 = new Date('2026-10-28T18:51:00Z')

describe('openingMonth', () => {
  it('opens on the current month whatever the Space has scheduled', () => {
    expect(openingMonth(OCT_28, 'America/Los_Angeles')).toEqual({ year: 2026, month1: 10, pinned: false })
  })

  it('follows the zone at a month boundary, not UTC', () => {
    const lateOct31Pacific = new Date('2026-11-01T03:30:00Z')
    expect(openingMonth(lateOct31Pacific, 'America/Los_Angeles').month1).toBe(10)
    expect(openingMonth(lateOct31Pacific, 'Pacific/Auckland').month1).toBe(11)
  })

  it('crosses the year the same way', () => {
    expect(openingMonth(new Date('2027-01-01T03:00:00Z'), 'America/Los_Angeles')).toEqual({ year: 2026, month1: 12, pinned: false })
  })

  it('lets the link name a month, and says it is pinned', () => {
    expect(openingMonth(OCT_28, null, { y: '2026', m: '12' })).toEqual({ year: 2026, month1: 12, pinned: true })
    expect(openingMonth(OCT_28, null, { y: ['2027'], m: ['2'] })).toEqual({ year: 2027, month1: 2, pinned: true })
  })

  it('ignores a malformed or half-given month', () => {
    expect(openingMonth(OCT_28, null, { y: '2026', m: '13' }).pinned).toBe(false)
    expect(openingMonth(OCT_28, null, { y: '2026' }).month1).toBe(10)
    expect(openingMonth(OCT_28, null, { y: 'x', m: 'y' }).pinned).toBe(false)
  })
})
