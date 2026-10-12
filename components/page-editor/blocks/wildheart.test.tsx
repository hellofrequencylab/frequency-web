import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WildheartNowLineBlock, WildheartSkyMapBlock, WildheartYearJourneyBlock, wildheartComponents } from './wildheart'
import { utcDate } from '@/lib/theme/astrology-wheel'

const now = utcDate(2027, 3, 23)
const metadata = { space: { events: [{ id: 'e1', slug: 'first', title: 'Spring gathering', startsAt: '2027-03-23T18:00' }, { id: 'e2', slug: 'second', title: 'A quiet evening', startsAt: '2027-04-06T18:00' }] } }

describe('the astrology calendar block family', () => {
  it('registers three blocks whose defaults are generic and gender-neutral', () => {
    expect(Object.keys(wildheartComponents)).toEqual(['WildheartYearJourney', 'WildheartSkyMap', 'WildheartNowLine'])
    const copy = JSON.stringify(Object.values(wildheartComponents).map((c) => [c.label, c.defaultProps]))
    expect(copy).not.toMatch(/women|sister|\bher\b|circle night|samhain|retreat|—/i)
    for (const c of Object.values(wildheartComponents)) expect(c.fields).toHaveProperty('layout')
  })

  it('sorts the sky and the Space events into the strip, marking the sign now', () => {
    const html = renderToStaticMarkup(<WildheartYearJourneyBlock heading="Every season has a door." now={now} metadata={metadata} />)
    expect(html).toContain('Every season has a door.')
    expect(html).toContain('Spring gathering')
    expect(html).toContain('A quiet evening')
    expect(html).toContain('Ostara')
    expect(html).toContain('Worm Moon')
    expect(html).toContain('aria-current="date"')
    expect((html.match(/<li data-season="/g) ?? []).length).toBe(12)
    expect(html).not.toMatch(/️/)
  })

  it('draws the sky map as an SVG wheel with twelve glyphs, four season arcs and a dot per item', () => {
    const html = renderToStaticMarkup(<WildheartSkyMapBlock now={now} metadata={metadata} />)
    expect((html.match(/class="wh-wheel-glyph"/g) ?? []).length).toBe(12)
    expect((html.match(/class="wh-wheel-season"/g) ?? []).length).toBe(4)
    expect(html).toContain('data-now=""')
    expect((html.match(/class="wh-wheel-dot"/g) ?? []).length).toBeGreaterThanOrEqual(8 + 24 + 2)
    expect(html).toContain('Mar 23 · Spring gathering')
    expect(html).toContain('class="wh-wheel-needle"')
    expect(html).toContain('Aries')
  })

  it('reads the date line for a day', () => {
    const html = renderToStaticMarkup(<WildheartNowLineBlock now={utcDate(2026, 10, 12)} />)
    expect(html).toContain('Fall · Wild')
    expect(html).toContain('Libra')
    expect(html).toContain('VII · Partners')
    // Two days past the new moon of Oct 10, 2026.
    expect(html).toMatch(/New moon|Waxing crescent/)
  })

  it('renders a year with no Space events from the sky alone', () => {
    const html = renderToStaticMarkup(<WildheartSkyMapBlock year={2030} now={now} />)
    expect(html).toContain('2030')
    expect(html).toContain('Yule')
    expect(html).not.toContain('wh-wheel-needle"')
  })
})
