import { describe, it, expect } from 'vitest'
import { followUpDue, guestFollowUpKey } from './route'

// LIVE-802: the follow-up window is read through the event's own zone, and the dedupe key is one
// per address per event, so the hourly cron sends each guest once.
describe('followUpDue', () => {
  // 18:00 wall clock in Los Angeles on 2026-11-05 is 02:00 UTC on 2026-11-06 (PST, UTC-8).
  const ev = { starts_at: '2026-11-05T18:00:00', ends_at: '2026-11-05T20:00:00', time_zone: 'America/Los_Angeles' }

  it('is not due within two hours of the end', () => {
    expect(followUpDue(ev, new Date('2026-11-06T05:00:00Z'))).toBe(false)
  })
  it('is due between two and twenty-six hours after the end', () => {
    expect(followUpDue(ev, new Date('2026-11-06T06:30:00Z'))).toBe(true)
    expect(followUpDue(ev, new Date('2026-11-07T05:00:00Z'))).toBe(true)
  })
  it('is no longer due after twenty-six hours', () => {
    expect(followUpDue(ev, new Date('2026-11-07T07:00:00Z'))).toBe(false)
  })
  it('assumes two hours when there is no end', () => {
    const open = { ...ev, ends_at: null }
    expect(followUpDue(open, new Date('2026-11-06T06:30:00Z'))).toBe(true)
  })
})

describe('guestFollowUpKey', () => {
  it('is case and space insensitive on the address', () => {
    expect(guestFollowUpKey('e1', ' Sam@Example.com ')).toBe(guestFollowUpKey('e1', 'sam@example.com'))
  })
})
