import { describe, expect, it } from 'vitest'
import { astrologyWheel, festivals, ingresses, moonEvents, phaseOf, seasonOf, signOf, sky, skyItems, utcDate, wheelAngle } from './astrology-wheel'

describe('the sun and the signs', () => {
  it('turns on the sign boundaries within a day of the ephemeris lines', () => {
    expect(signOf(utcDate(2027, 3, 22))).toBe('aries')
    expect(signOf(utcDate(2027, 3, 18))).toBe('pisces')
    expect(signOf(utcDate(2027, 6, 23))).toBe('cancer')
    expect(signOf(utcDate(2027, 9, 24))).toBe('libra')
    expect(signOf(utcDate(2027, 12, 23))).toBe('capricorn')
    expect(signOf(utcDate(2027, 1, 10))).toBe('capricorn')
    expect(signOf(utcDate(2027, 1, 25))).toBe('aquarius')
    expect(signOf(utcDate(2026, 10, 12))).toBe('libra')
  })

  it('reads the season from the sign, so a season turns at the ingress', () => {
    expect(seasonOf(utcDate(2027, 1, 1))).toBe('winter')
    expect(seasonOf(utcDate(2027, 4, 1))).toBe('spring')
    expect(seasonOf(utcDate(2027, 7, 1))).toBe('summer')
    expect(seasonOf(utcDate(2027, 10, 1))).toBe('fall')
    expect(seasonOf(utcDate(2027, 12, 25))).toBe('winter')
  })

  it('finds every ingress of the year, with the winter solstice before it for Capricorn', () => {
    const list = ingresses(2027)
    expect(list.map((i) => i.id)).toEqual(['capricorn', 'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn'])
    expect(list[0].start.getUTCFullYear()).toBe(2026)
    expect(Math.abs(list[3].start.getTime() - utcDate(2027, 3, 20).getTime())).toBeLessThanOrEqual(2 * 864e5)
  })

  it('puts the winter solstice at the top of the wheel', () => {
    expect(wheelAngle(ingresses(2027)[0].start)).toBeLessThan(2)
    expect(wheelAngle(utcDate(2027, 6, 21))).toBeGreaterThan(175)
    expect(wheelAngle(utcDate(2027, 6, 21))).toBeLessThan(185)
  })
})

describe('the moon', () => {
  it("is full on the handoff's Wolf Moon and the real Hunter's Moon", () => {
    expect(phaseOf(utcDate(2027, 1, 23))).toBe(4)
    expect(phaseOf(utcDate(2026, 10, 26))).toBe(4)
    expect(phaseOf(utcDate(2027, 1, 8))).toBe(0)
  })

  it('lists one new and one full moon a month, each within a day of the handoff calendar', () => {
    const handoff = ['2027-01-08', '2027-01-23', '2027-02-07', '2027-02-21', '2027-03-08', '2027-03-23', '2027-06-05', '2027-06-19', '2027-10-16', '2027-10-30', '2027-12-14', '2027-12-28']
    const ours = moonEvents(2027)
    expect(ours.filter((m) => m.phase === 4)).toHaveLength(12)
    expect(ours.filter((m) => m.phase === 0).length).toBeGreaterThanOrEqual(12)
    for (const iso of handoff) {
      const [y, m, d] = iso.split('-').map(Number)
      const near = ours.some((e) => Math.abs(e.day.getTime() - utcDate(y, m, d).getTime()) <= 864e5)
      expect(near, iso).toBe(true)
    }
  })
})

describe('astrologyWheel', () => {
  const year = 2027
  const items = [
    { id: 'b', date: '2027-03-23T18:00', title: 'Second', kind: 'gathering' as const },
    { id: 'a', date: '2027-03-09', title: 'First', kind: 'gathering' as const },
    { id: 'z', date: '2026-12-31', title: 'Last year', kind: 'gathering' as const },
    { id: 'bad', date: 'soon', title: 'No date', kind: 'event' as const },
    { id: 'c', date: '2027-10-31', title: 'Samhain', kind: 'festival' as const },
  ]

  it('sorts the items into their month and sign, by date, dropping the rest', () => {
    const wheel = astrologyWheel(year, items)
    expect(wheel.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(wheel.months[2].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(wheel.months[9].items.map((i) => i.id)).toEqual(['c'])
    expect(wheel.items[0].sign).toBe('pisces')
    expect(wheel.items[1].sign).toBe('aries')
    expect(wheel.signs.find((s) => s.id === 'scorpio')?.items.map((i) => i.id)).toEqual(['c'])
    expect(wheel.items[2].season).toBe('fall')
  })

  it('walks the twelve signs from Capricorn with contiguous angles and four season arcs', () => {
    const wheel = astrologyWheel(year, [])
    expect(wheel.signs.map((s) => s.id)).toEqual(['capricorn', 'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius'])
    expect(wheel.signs[0].startAngle).toBe(0)
    for (let i = 1; i < 12; i++) expect(wheel.signs[i].startAngle).toBeGreaterThan(wheel.signs[i - 1].startAngle)
    expect(wheel.seasons.map((s) => s.id)).toEqual(['winter', 'spring', 'summer', 'fall'])
    expect(wheel.seasons[0].startAngle).toBe(0)
    expect(wheel.seasons[3].endAngle).toBe(360)
    expect(wheel.months).toHaveLength(12)
    expect(wheel.months[0].startAngle).toBe(0)
  })

  it("draws the year's eight festivals and its moons as its own items", () => {
    expect(festivals(year).map((f) => f.title)).toEqual(['Imbolc', 'Ostara', 'Beltane', 'Litha', 'Lughnasadh', 'Mabon', 'Samhain', 'Yule'])
    const wheel = astrologyWheel(year, skyItems(year))
    expect(wheel.items.filter((i) => i.kind === 'festival')).toHaveLength(8)
    expect(wheel.items.filter((i) => i.kind === 'moon').length).toBeGreaterThanOrEqual(24)
    expect(wheel.items.find((i) => i.title === "Hunter's Moon")?.month).toBe(9)
  })

  it('reads one date whole', () => {
    const s = sky(utcDate(2026, 10, 12))
    expect(s).toMatchObject({ sign: 'libra', house: 'VII', houseName: 'Partners', season: 'fall', seasonName: 'Fall', seasonTheme: 'Wild' })
    expect(s.glyph.endsWith('︎')).toBe(true)
    expect(s.range[0].getTime()).toBeLessThanOrEqual(s.date.getTime())
  })
})
