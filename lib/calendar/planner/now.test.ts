import { describe, expect, it } from 'vitest'
import { nowMinutes, wallMinutes } from './now'

describe('the now clock', () => {
  it('reads the wall clock of the Space zone', () => {
    // 21:24 UTC on Oct 21 is 14:24 in Los Angeles (PDT) and 17:24 in New York (EDT).
    const at = new Date('2026-10-21T21:24:00Z')
    expect(wallMinutes(at, 'America/Los_Angeles')).toBe(14 * 60 + 24)
    expect(wallMinutes(at, 'America/New_York')).toBe(17 * 60 + 24)
  })
  it('falls back to UTC for a zone it does not know', () => {
    expect(wallMinutes(new Date('2026-10-21T21:24:00Z'), 'Not/AZone')).toBe(21 * 60 + 24)
  })
  it('moves on by whole elapsed minutes and stays inside the day', () => {
    expect(nowMinutes(864, 0)).toBe(864)
    expect(nowMinutes(864, 125_000)).toBe(866)
    expect(nowMinutes(1439, 600_000)).toBe(1439)
    expect(nowMinutes(10, -5000)).toBe(10)
  })
})
