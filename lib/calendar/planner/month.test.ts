import { describe, expect, it } from 'vitest'
import type { AstroMarker } from '../astro-markers'
import { monthName, monthSky, monthWeeks, monthsBetween, seasonOn, shiftMonth, skyOnDay, sunSignOn } from './month'

const mk = (day: string, kind: AstroMarker['kind'], extra: Partial<AstroMarker> = {}): AstroMarker => ({
  day,
  kind,
  at: `${day}T12:00:00Z`,
  label: kind,
  symbol: '*',
  ...extra,
})

const OCT: AstroMarker[] = [
  mk('2026-09-22', 'sign-ingress', { sign: 'virgo', symbol: 'V', solarPoint: 'september-equinox' }),
  mk('2026-10-10', 'new-moon'),
  mk('2026-10-23', 'sign-ingress', { sign: 'scorpio', symbol: 'S' }),
  mk('2026-10-25', 'full-moon'),
  mk('2026-12-21', 'sign-ingress', { sign: 'capricorn', symbol: 'C', solarPoint: 'december-solstice' }),
]

describe('monthWeeks', () => {
  it('starts on the Monday on or before the 1st and runs whole weeks', () => {
    const weeks = monthWeeks('2026-10')
    expect(weeks[0][0]).toBe('2026-09-28')
    expect(weeks[0]).toHaveLength(7)
    expect(weeks).toHaveLength(5)
    expect(weeks[4][6]).toBe('2026-11-01')
  })
  it('uses six rows when the month needs them', () => {
    const weeks = monthWeeks('2026-08')
    expect(weeks[0][0]).toBe('2026-07-27')
    expect(weeks).toHaveLength(6)
    expect(weeks[5][0]).toBe('2026-08-31')
  })
  it('holds four rows for a February that fits', () => {
    expect(monthWeeks('2027-02')).toHaveLength(4)
  })
})

describe('month arithmetic', () => {
  it('steps across a year end', () => {
    expect(shiftMonth('2026-11', 2)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthsBetween('2026-10', '2027-02')).toBe(4)
    expect(monthName('2026-10')).toBe('October')
  })
})

describe('the sky of a month', () => {
  it('reads the season from the equinox and solstice markers', () => {
    expect(seasonOn('2026-10-15', OCT)).toBe('Autumn')
    expect(seasonOn('2026-12-21', OCT)).toBe('Winter')
    expect(seasonOn('2026-12-20', OCT)).toBe('Autumn')
  })
  it('falls back to the usual dates with no markers', () => {
    expect(seasonOn('2026-07-04', [])).toBe('Summer')
    expect(seasonOn('2026-01-04', [])).toBe('Winter')
  })
  it('names the ingress and the moons of October', () => {
    const sky = monthSky('2026-10', OCT)
    expect(sky.season).toBe('Autumn')
    expect(sky.line).toBe('The light turns. Slow down.')
    expect(sky.ingress).toBe('Sun into Scorpio on the 23rd')
    expect(sky.moons).toBe('New Oct 10 · Full Oct 25')
  })
  it('says when a season begins inside the month', () => {
    expect(monthSky('2026-12', OCT).line).toBe('Winter begins Dec 21 · Winter solstice')
    expect(monthSky('2026-12', []).line).toBe('Winter begins Dec 21 · Winter solstice')
  })
  it('puts the ordinals right', () => {
    const one = [mk('2026-11-01', 'sign-ingress', { sign: 'scorpio' }), mk('2026-12-02', 'sign-ingress', { sign: 'sagittarius' }), mk('2027-01-03', 'sign-ingress', { sign: 'capricorn' }), mk('2027-02-11', 'sign-ingress', { sign: 'aquarius' })]
    expect(monthSky('2026-11', one).ingress).toBe('Sun into Scorpio on the 1st')
    expect(monthSky('2026-12', one).ingress).toBe('Sun into Sagittarius on the 2nd')
    expect(monthSky('2027-01', one).ingress).toBe('Sun into Capricorn on the 3rd')
    expect(monthSky('2027-02', one).ingress).toBe('Sun into Aquarius on the 11th')
  })
  it('is quiet when the sky is off', () => {
    const sky = monthSky('2026-10', [])
    expect(sky.ingress).toBe('')
    expect(sky.moons).toBe('')
  })
  it('finds the Sun sign on a day', () => {
    expect(sunSignOn('2026-10-21', OCT)).toEqual({ sign: 'Virgo', symbol: 'V' })
    expect(sunSignOn('2026-10-24', OCT)).toEqual({ sign: 'Scorpio', symbol: 'S' })
    expect(sunSignOn('2026-01-01', OCT)).toBeNull()
  })
  it('picks the marker a cell draws', () => {
    expect(skyOnDay('2026-10-10', OCT)).toEqual({ icon: 'moon', label: 'New moon' })
    expect(skyOnDay('2026-09-22', OCT)).toEqual({ icon: 'sun', label: 'Autumn equinox' })
    expect(skyOnDay('2026-10-23', OCT)).toEqual({ icon: 'sign', label: 'Sun into Scorpio' })
    expect(skyOnDay('2026-10-11', OCT)).toBeNull()
  })
})
