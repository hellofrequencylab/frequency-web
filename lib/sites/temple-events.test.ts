import { describe, expect, it } from 'vitest'
import { templeStamp, templeWhen } from './temple-events'

describe('the Temple event lines', () => {
  it('reads the stored wall clock as it is, never through a zone', () => {
    // 5 PM in Los Angeles is stored as 17:00 UTC parts (lib/time/zone.ts).
    expect(templeWhen('2026-10-25T17:00:00Z', '2026-10-25T19:00:00Z')).toBe('Sun Oct 25 · 5–7 PM')
    expect(templeWhen('2026-10-27T18:00:00Z', '2026-10-27T21:00:00Z')).toBe('Tue Oct 27 · 6–9 PM')
  })
  it('names both periods when the hours cross noon, and the minutes when there are any', () => {
    expect(templeWhen('2026-11-01T11:30:00Z', '2026-11-01T13:00:00Z')).toBe('Sun Nov 1 · 11:30 AM–1 PM')
    expect(templeWhen('2026-11-01T19:00:00Z')).toBe('Sun Nov 1 · 7 PM')
  })
  it('stamps the day and the month, and returns null for an unreadable start', () => {
    expect(templeStamp('2026-10-25T17:00:00Z')).toEqual({ day: '25', month: 'Oct' })
    expect(templeStamp('nope')).toBeNull()
    expect(templeWhen('nope')).toBeNull()
  })
})
