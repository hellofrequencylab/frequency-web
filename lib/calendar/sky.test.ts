import { describe, expect, it } from 'vitest'
import { SKY_MARKER_KINDS, skyMarker, skyMarkersForRange, solarQuarterInstant, type SolarQuarter } from './sky'

const QUARTERS: SolarQuarter[] = ['march-equinox', 'june-solstice', 'september-equinox', 'december-solstice']

// Published instants, to the minute (Meeus ch. 27 is good to about that). Pinned rather than derived:
// a slip in the quartic or in table 27.C shifts these by hours, and a wrong DAY is what a member
// would see. Source values are the standard ephemeris times for 2026 and 2027.
const PINNED: [number, SolarQuarter, string][] = [
  [2026, 'march-equinox', '2026-03-20T14:45'],
  [2026, 'june-solstice', '2026-06-21T08:24'],
  [2026, 'september-equinox', '2026-09-23T00:05'],
  [2026, 'december-solstice', '2026-12-21T20:50'],
  [2027, 'march-equinox', '2027-03-20T20:24'],
  [2027, 'june-solstice', '2027-06-21T14:10'],
  [2027, 'september-equinox', '2027-09-23T06:01'],
  [2027, 'december-solstice', '2027-12-22T02:42'],
]

describe('solarQuarterInstant', () => {
  for (const [year, quarter, expected] of PINNED) {
    it(`${year} ${quarter} lands at ${expected}Z`, () => {
      expect(solarQuarterInstant(year, quarter).toISOString().slice(0, 16)).toBe(expected)
    })
  }

  it('keeps each quarter in its own week of the year across two centuries', () => {
    const windows: Record<SolarQuarter, [string, string]> = {
      'march-equinox': ['03-19', '03-21'],
      'june-solstice': ['06-20', '06-22'],
      'september-equinox': ['09-21', '09-24'],
      'december-solstice': ['12-20', '12-23'],
    }
    for (let year = 1900; year <= 2100; year++) {
      for (const quarter of QUARTERS) {
        const md = solarQuarterInstant(year, quarter).toISOString().slice(5, 10)
        const [lo, hi] = windows[quarter]
        expect(md >= lo && md <= hi, `${year} ${quarter} fell on ${md}`).toBe(true)
      }
    }
  })

  it('repeats a quarter one tropical year later', () => {
    for (const quarter of QUARTERS) {
      const a = solarQuarterInstant(2026, quarter).getTime()
      const b = solarQuarterInstant(2027, quarter).getTime()
      const days = (b - a) / 86_400_000
      expect(days).toBeGreaterThan(365.2)
      expect(days).toBeLessThan(365.3)
    }
  })
})

describe('skyMarkersForRange', () => {
  it('reads the day in the zone it is given, and the equinox is the owner\'s own Sep 22', () => {
    // The 2026 autumn equinox is 00:05 UTC on Sep 23, which is 5:05 PM on Sep 22 in Vista. Royal
    // Temple's season opens on its "Fall Equinox" the evening of Tue Sep 22 2026, so the local
    // reading is the one a Space means.
    const vista = skyMarkersForRange('2026-09-01', '2026-09-30', 'America/Los_Angeles')
    expect(vista.get('2026-09-22')?.map((m) => m.kind)).toEqual(['september-equinox'])
    expect(vista.has('2026-09-23')).toBe(false)

    const utc = skyMarkersForRange('2026-09-01', '2026-09-30')
    expect(utc.get('2026-09-23')?.map((m) => m.kind)).toEqual(['september-equinox'])
    expect(utc.has('2026-09-22')).toBe(false)
  })

  it('marks a full year: four solar quarters and a moon of each phase every month', () => {
    const year = skyMarkersForRange('2026-10-01', '2027-09-30', 'America/Los_Angeles')
    const kinds = [...year.values()].flat().map((m) => m.kind)
    expect(kinds.filter((k) => k === 'march-equinox' || k === 'september-equinox').length).toBe(2)
    expect(kinds.filter((k) => k === 'june-solstice' || k === 'december-solstice').length).toBe(2)
    for (const phase of ['new-moon', 'full-moon'] as const) {
      const n = kinds.filter((k) => k === phase).length
      expect(n, `${phase} count`).toBeGreaterThanOrEqual(12)
      expect(n, `${phase} count`).toBeLessThanOrEqual(13)
    }
    // Every key is inside the window, and no day repeats a kind.
    for (const [day, markers] of year) {
      expect(day >= '2026-10-01' && day <= '2027-09-30', day).toBe(true)
      expect(new Set(markers.map((m) => m.kind)).size).toBe(markers.length)
      expect(markers.length).toBeGreaterThan(0)
    }
  })

  it('spaces new moons one synodic month apart', () => {
    const days = [...skyMarkersForRange('2026-01-01', '2026-12-31', 'UTC')]
      .filter(([, ms]) => ms.some((m) => m.kind === 'new-moon'))
      .map(([d]) => Date.parse(`${d}T00:00:00Z`))
      .sort((a, b) => a - b)
    for (let i = 1; i < days.length; i++) {
      const gap = (days[i] - days[i - 1]) / 86_400_000
      expect(gap, 'gap between new moons').toBeGreaterThanOrEqual(29)
      expect(gap, 'gap between new moons').toBeLessThanOrEqual(30)
    }
  })

  it('is empty on bounds it cannot read, so a render never branches', () => {
    expect(skyMarkersForRange('nope', '2026-12-31').size).toBe(0)
    expect(skyMarkersForRange('2026-12-31', '2026-01-01').size).toBe(0)
    expect(skyMarkersForRange('2026-02-30', '2026-03-01').size).toBe(0)
  })

  it('gives every kind an emoji and words', () => {
    expect(SKY_MARKER_KINDS).toHaveLength(6)
    for (const kind of SKY_MARKER_KINDS) {
      const m = skyMarker(kind)
      expect(m.emoji.length).toBeGreaterThan(0)
      expect(m.label).toMatch(/^[A-Z][^.]*$/)
    }
  })
})
