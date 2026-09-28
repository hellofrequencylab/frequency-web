import { describe, expect, it } from 'vitest'
import { Seasons } from 'astronomy-engine'
import { astroMarkersInRange, astroMarkersByDay } from './astro-markers'

const PACIFIC = 'America/Los_Angeles'

describe('the sky on a Space calendar', () => {
  // 🔴 THE DEFECT FAMILY THIS ROW COULD HAVE JOINED. The October 2026 full moon is
  // 2026-10-26T04:12Z, which is the 25th in California. Putting it on the 26th is LIVE-514 and
  // LIVE-516 all over again: a UTC instant dropped on the wrong square.
  it('dates a marker by the SPACE zone, not UTC', () => {
    const pacific = astroMarkersInRange('2026-10-01', '2026-10-31', PACIFIC)
    const full = pacific.find((m) => m.kind === 'full-moon')
    // The instant is asserted to the MINUTE, not the millisecond. Meeus (lib/calendar/moon.ts) and
    // astronomy-engine put this full moon 26 seconds apart, which is well inside what either method
    // claims and is invisible to a calendar. Pinning the exact millisecond of whichever engine
    // happens to be wired would fail the day the other one is, and would be testing the arithmetic
    // rather than the consequence. THE DAY is the consequence: which square it lands on.
    expect(full?.at?.slice(0, 16)).toBe('2026-10-26T04:11')
    expect(full?.day).toBe('2026-10-25')

    // The same instant, read in UTC, is the next day. If these ever agree, the fold is gone.
    const utc = astroMarkersInRange('2026-10-01', '2026-10-31', 'UTC')
    expect(utc.find((m) => m.kind === 'full-moon')?.day).toBe('2026-10-26')
  })

  // 🔴 THE POINT OF THE ONE-MARKER RULE. The cardinal ingresses ARE the equinoxes and solstices,
  // to the millisecond. Two markers on that day would be the two-rows-over-one-subject bug.
  it('emits ONE marker where a sign ingress and a season point are the same moment', () => {
    const s = Seasons(2026)
    for (const [iso, sign, point] of [
      [s.mar_equinox.date.toISOString(), 'aries', 'march-equinox'],
      [s.jun_solstice.date.toISOString(), 'cancer', 'june-solstice'],
      [s.sep_equinox.date.toISOString(), 'libra', 'september-equinox'],
      [s.dec_solstice.date.toISOString(), 'capricorn', 'december-solstice'],
    ] as const) {
      const day = iso.slice(0, 10)
      const onThatInstant = astroMarkersInRange(day, day, 'UTC').filter((m) => m.at === iso)
      expect(onThatInstant, `${point}`).toHaveLength(1)
      expect(onThatInstant[0].sign, point).toBe(sign)
      expect(onThatInstant[0].solarPoint, point).toBe(point)
      // Both facts are in the one label, so nothing is lost by not splitting it.
      expect(onThatInstant[0].label.toLowerCase(), point).toContain(sign)
    }
  })

  it('gives the eight non-cardinal ingresses a sign and no solar point', () => {
    const year = astroMarkersInRange('2026-01-01', '2026-12-31', 'UTC')
    const ingresses = year.filter((m) => m.kind === 'sign-ingress')
    expect(ingresses).toHaveLength(12)
    expect(ingresses.filter((m) => m.solarPoint).length).toBe(4)
    expect(new Set(ingresses.map((m) => m.sign)).size).toBe(12)
    for (const m of ingresses) expect(m.sign, m.label).toBeTruthy()
  })

  it('finds a full year of moons, each one once', () => {
    const year = astroMarkersInRange('2026-01-01', '2026-12-31', 'UTC')
    const news = year.filter((m) => m.kind === 'new-moon')
    const fulls = year.filter((m) => m.kind === 'full-moon')
    // A tropical year holds 12 or 13 of each.
    expect(news.length).toBeGreaterThanOrEqual(12)
    expect(news.length).toBeLessThanOrEqual(13)
    expect(fulls.length).toBeGreaterThanOrEqual(12)
    expect(fulls.length).toBeLessThanOrEqual(13)
    // The lunation walk steps past each hit; if it ever failed to, the same instant would repeat.
    expect(new Set(news.map((m) => m.at)).size).toBe(news.length)
    expect(new Set(fulls.map((m) => m.at)).size).toBe(fulls.length)
  })

  it('never returns a marker outside the window it was asked for', () => {
    const m = astroMarkersInRange('2026-10-01', '2026-10-31', PACIFIC)
    expect(m.length).toBeGreaterThan(0)
    for (const x of m) {
      expect(x.day >= '2026-10-01', x.label).toBe(true)
      expect(x.day <= '2026-10-31', x.label).toBe(true)
    }
  })

  it('returns markers in time order', () => {
    const m = astroMarkersInRange('2026-01-01', '2026-12-31', 'UTC')
    for (let i = 1; i < m.length; i += 1) expect(m[i].at >= m[i - 1].at).toBe(true)
  })

  // A calendar that cannot draw the moon must still draw the gatherings.
  it('is total against nonsense rather than throwing', () => {
    expect(astroMarkersInRange('', '', PACIFIC)).toEqual([])
    expect(astroMarkersInRange('not-a-day', '2026-10-31', PACIFIC)).toEqual([])
    expect(astroMarkersInRange('2026-10-31', '2026-10-01', PACIFIC)).toEqual([])
    // A missing or unrecognised zone must NOT blank the sky: `dayInZone` resolves an unknown zone
    // to the home zone and falls back to the UTC day rather than throwing, so the markers still
    // land -- they are merely dated by the fallback. Asserting [] here would have pinned the
    // opposite of what the code does, and of what a calendar should do.
    expect(astroMarkersInRange('2026-10-01', '2026-10-31', null)).not.toHaveLength(0)
    expect(astroMarkersInRange('2026-10-01', '2026-10-31', 'Not/AZone')).not.toHaveLength(0)
  })

  it('reuses the repo zodiac vocabulary rather than inventing labels', () => {
    const m = astroMarkersInRange('2026-10-23', '2026-10-23', 'UTC')
    const scorpio = m.find((x) => x.sign === 'scorpio')
    // NOT "Scorpio season": `season` is a locked Quest word in NAMING.md and this is member-facing
    // copy (owner ruling 2026-09-28). This assertion is the guard against it coming back.
    expect(scorpio?.label).toBe('Sun enters Scorpio')
    expect(scorpio?.symbol).toBe('♏')
  })

  it('groups by day for a month grid', () => {
    const byDay = astroMarkersByDay(astroMarkersInRange('2026-10-01', '2026-10-31', PACIFIC))
    expect(byDay.get('2026-10-25')?.[0]?.kind).toBe('full-moon')
    expect(byDay.get('2026-10-10')?.[0]?.kind).toBe('new-moon')
    expect(byDay.get('2026-10-02')).toBeUndefined()
  })

  // A single day is the narrowest window a grid ever asks for, and the zone slack must not let a
  // neighbouring day's marker leak into it.
  it('answers a one-day window without bleeding the days either side', () => {
    expect(astroMarkersInRange('2026-10-25', '2026-10-25', PACIFIC).map((m) => m.kind)).toEqual(['full-moon'])
    expect(astroMarkersInRange('2026-10-26', '2026-10-26', PACIFIC)).toEqual([])
  })
})

describe('the copy stays off locked vocabulary', () => {
  // docs/NAMING.md locks "season" as a Quest word: a Quest IS a season, and the four are Stretch,
  // Shed, Sit and Sprout. These markers are member-facing copy on a public calendar, so the word
  // would carry a second meaning there. Owner ruling 2026-09-28: "Sun enters <sign>".
  it('never says "season" in a label a member reads', () => {
    const year = astroMarkersInRange('2026-01-01', '2026-12-31', 'UTC')
    expect(year.length).toBeGreaterThan(30)
    for (const m of year) expect(m.label.toLowerCase(), m.label).not.toContain('season')
  })

  it('leads with the sign and carries the solar point on the four cardinal days', () => {
    const libra = astroMarkersInRange('2026-09-23', '2026-09-23', 'UTC').find((m) => m.sign === 'libra')
    expect(libra?.label).toBe('Sun enters Libra, September equinox')
    expect(libra?.solarPoint).toBe('september-equinox')
  })

  // docs/CONTENT-VOICE.md: no em dashes in member-facing copy.
  it('carries no em dash', () => {
    for (const m of astroMarkersInRange('2026-01-01', '2026-12-31', 'UTC')) {
      expect(m.label, m.label).not.toContain('—')
    }
  })
})
