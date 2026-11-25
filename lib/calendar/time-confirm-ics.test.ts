import { describe, expect, it } from 'vitest'
import { buildTimeInviteIcs } from './time-confirm-ics'

const NOW = new Date(Date.UTC(2026, 10, 24, 12))
const base = {
  entryId: '00000000-0000-4000-8000-000000000001',
  title: 'Winter beach cleanups; bring gloves',
  spaceName: 'North Light',
  timeZone: 'America/Los_Angeles',
}

describe('the confirmed date invite', () => {
  it('stamps a timed date at its true instant in the Space zone', () => {
    // 7:00 PM wall clock in Los Angeles on Dec 6 is 03:00 UTC on Dec 7.
    const ics = buildTimeInviteIcs({ ...base, startsAt: '2026-12-06T19:00:00Z', endsAt: '2026-12-06T21:00:00Z', allDay: false }, NOW)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART:20261207T030000Z')
    expect(ics).toContain('DTEND:20261207T050000Z')
    expect(ics).toContain('SUMMARY:Winter beach cleanups\\; bring gloves')
    expect(ics).toContain('UID:time-00000000-0000-4000-8000-000000000001@frequency')
  })

  it('writes an all-day date as a DATE value with the exclusive end', () => {
    const ics = buildTimeInviteIcs({ ...base, startsAt: '2026-12-06T00:00:00Z', endsAt: '2026-12-07T00:00:00Z', allDay: true }, NOW)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261206')
    expect(ics).toContain('DTEND;VALUE=DATE:20261207')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
