import { describe, it, expect } from 'vitest'
import { upcomingEventFloor } from './upcoming-floor'

// The bug this exists to stop: after ~5pm Pacific, UTC has rolled into tomorrow, so a raw
// `new Date().toISOString()` floor is already TOMORROW's date and every event happening TONIGHT
// falls below it. These cases pin both sides of that boundary.

describe('upcomingEventFloor', () => {
  it('is midnight of TODAY in the community zone, not the current instant', () => {
    // 2026-08-20 18:30 UTC = 11:30am Pacific. Still the 20th either way.
    expect(upcomingEventFloor(new Date('2026-08-20T18:30:00Z'))).toBe('2026-08-20T00:00:00.000Z')
  })

  it('🔴 after 5pm Pacific — UTC is tomorrow, the floor is still TODAY', () => {
    // 2026-08-21 02:00 UTC = 2026-08-20 7:00pm Pacific. A raw ISO floor here reads "2026-08-21…",
    // which is above every event happening tonight. This must stay on the 20th.
    const floor = upcomingEventFloor(new Date('2026-08-21T02:00:00Z'))
    expect(floor).toBe('2026-08-20T00:00:00.000Z')
    expect(floor < '2026-08-20T19:00:00Z').toBe(true) // tonight's 7pm event survives the bound
  })

  it('does not drop an event that has already begun today', () => {
    // 11:59pm Pacific on the 20th: a 7pm event started four hours ago and is still "today".
    const floor = upcomingEventFloor(new Date('2026-08-21T06:59:00Z'))
    expect(floor).toBe('2026-08-20T00:00:00.000Z')
  })

  it('rolls over at community midnight, not UTC midnight', () => {
    // 2026-08-21 07:01 UTC = 12:01am Pacific on the 21st. NOW it is tomorrow.
    expect(upcomingEventFloor(new Date('2026-08-21T07:01:00Z'))).toBe('2026-08-21T00:00:00.000Z')
  })
})
