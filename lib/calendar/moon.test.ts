import { describe, expect, it } from 'vitest'
import { dayInTimeZone, lunarPhaseDates, lunarPhaseInstant, lunarPhaseInstants } from './moon'

// Every new moon of 2026, UTC calendar day, from the published ephemeris. The instants that a local
// zone could move across midnight are called out where they matter below.
const NEW_MOONS_2026_UTC = [
  '2026-01-18',
  '2026-02-17',
  '2026-03-19',
  '2026-04-17',
  '2026-05-16',
  '2026-06-15',
  '2026-07-14',
  '2026-08-12',
  '2026-09-11',
  '2026-10-10',
  '2026-11-09',
  '2026-12-09',
]

describe('lunarPhaseDates (Meeus ch. 49)', () => {
  it('finds every new moon of 2026 on its UTC day', () => {
    expect(lunarPhaseDates('new', '2026-01-01', '2026-12-31', 'UTC')).toEqual(NEW_MOONS_2026_UTC)
  })

  it('lands within a few minutes of the ephemeris instants', () => {
    // Published: 2026-01-18 19:52 UTC, 2026-03-19 01:23 UTC, 2026-12-09 00:52 UTC.
    const jan = lunarPhaseInstants('new', '2026-01-18', '2026-01-18')[0]
    expect(Math.abs(jan.getTime() - Date.UTC(2026, 0, 18, 19, 52))).toBeLessThan(5 * 60_000)
    const mar = lunarPhaseInstants('new', '2026-03-19', '2026-03-19')[0]
    expect(Math.abs(mar.getTime() - Date.UTC(2026, 2, 19, 1, 23))).toBeLessThan(5 * 60_000)
    const dec = lunarPhaseInstants('new', '2026-12-09', '2026-12-09')[0]
    expect(Math.abs(dec.getTime() - Date.UTC(2026, 11, 9, 0, 52))).toBeLessThan(5 * 60_000)
  })

  it('reports local days in the Space zone, shifting only the instants that cross local midnight', () => {
    // The December new moon is at 00:52 UTC, within an hour of UTC midnight, so every zone west of
    // UTC reads it a day earlier. That shift is the zone doing its job, not the arithmetic slipping.
    // The other shifts below (March 01:23 UTC, June 02:54 UTC, September 03:27 UTC, November 07:02
    // UTC) are the same: each instant is before 08:00 UTC, which is the previous evening in Los
    // Angeles. Nothing that falls in the middle of a UTC day moves.
    const la = lunarPhaseDates('new', '2026-01-01', '2026-12-31', 'America/Los_Angeles')
    expect(la).toEqual([
      '2026-01-18',
      '2026-02-17',
      '2026-03-18',
      '2026-04-17',
      '2026-05-16',
      '2026-06-14',
      '2026-07-14',
      '2026-08-12',
      '2026-09-10',
      '2026-10-10',
      '2026-11-08',
      '2026-12-08',
    ])
    // Tokyo is east of UTC: a mid-day UTC instant may land on the next local day, never the previous.
    const tokyo = lunarPhaseDates('new', '2026-01-01', '2026-12-31', 'Asia/Tokyo')
    expect(tokyo).toHaveLength(12)
    expect(tokyo[0]).toBe('2026-01-19')
    expect(tokyo[11]).toBe('2026-12-09')
  })

  it('finds full moons at k + 0.5 (2026-01-03, 2026-02-01, 2026-03-03 UTC)', () => {
    expect(lunarPhaseDates('full', '2026-01-01', '2026-03-31', 'UTC')).toEqual(['2026-01-03', '2026-02-01', '2026-03-03'])
  })

  it('keeps to the asked range, inclusive, and returns nothing for a bad range', () => {
    expect(lunarPhaseDates('new', '2026-09-11', '2026-09-11', 'UTC')).toEqual(['2026-09-11'])
    expect(lunarPhaseDates('new', '2026-09-12', '2026-10-09', 'UTC')).toEqual([])
    expect(lunarPhaseDates('new', '2026-10-01', '2026-09-01', 'UTC')).toEqual([])
    expect(lunarPhaseDates('new', '2026-02-31', '2026-12-31', 'UTC')).toEqual([])
    expect(lunarPhaseDates('new', 'winter', '2026-12-31', 'UTC')).toEqual([])
  })

  it('reads an unknown zone as UTC rather than throwing', () => {
    expect(dayInTimeZone(new Date('2026-12-09T00:51:00Z'), 'Not/AZone')).toBe('2026-12-09')
    expect(lunarPhaseDates('new', '2026-12-01', '2026-12-31', 'Not/AZone')).toEqual(['2026-12-09'])
  })

  it('is monotonic in k: consecutive new moons are about a synodic month apart', () => {
    const a = lunarPhaseInstant(330).getTime()
    const b = lunarPhaseInstant(331).getTime()
    const days = (b - a) / 86_400_000
    expect(days).toBeGreaterThan(29.2)
    expect(days).toBeLessThan(29.9)
  })
})
