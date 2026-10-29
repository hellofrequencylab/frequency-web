import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { freeHumanCalendarBlocks } from './free-human-calendar'
import { freeHumanWheelBlocks } from './free-human-wheel'
import { freeHumanCalendarPage } from '@/lib/sites/free-human-home'
import { hasFreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { freeHumanOccurrences } from '@/lib/sites/free-human-events'
import { freeHumanMoon, freeHumanSeason } from '@/lib/sites/free-human-sky'
import { FREE_HUMAN_KINDS, freeHumanAgenda, freeHumanCollapse, freeHumanMonthAt, freeHumanMonthCells, freeHumanMonthStrip, type FreeHumanOcc } from '@/lib/sites/free-human-calendar'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home', 'calendar'], contactHref: '/contact', bookHref: null, email: null }
const draw = (type: string, props: Record<string, unknown> = {}, metadata: Record<string, unknown> = { links }) => {
  const c = { ...freeHumanCalendarBlocks, ...freeHumanWheelBlocks }[type]
  return renderToStaticMarkup(<>{(c.render as (p: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...props, puck: { metadata } })}</>)
}
const occ = (id: string, title: string, startsAt: string, extra: Partial<FreeHumanOcc> = {}): FreeHumanOcc => ({ id, title, kind: 'gathering', startsAt, endsAt: null, place: '', price: '', summary: '', href: '', recurring: false, ...extra })

describe('the Free Human Calendar page seed', () => {
  it('registers every block it names and only draws marks that exist', () => {
    const page = freeHumanCalendarPage()
    const types = page.blocks.map((b: { type: string }) => b.type)
    for (const t of types) expect({ ...freeHumanCalendarBlocks, ...freeHumanWheelBlocks }[t], t).toBeTruthy()
    for (const m of JSON.stringify(page).matchAll(/"glyph":"([^"]+)"/g)) expect(hasFreeHumanGlyph(m[1]), m[1]).toBe(true)
  })
  it('draws both blocks with their defaults, with no events', () => {
    for (const t of [...Object.keys(freeHumanCalendarBlocks), ...Object.keys(freeHumanWheelBlocks)]) expect(draw(t)).toContain('fh-sec')
  })
  it('names a mark for every kind', () => {
    for (const k of FREE_HUMAN_KINDS) expect(hasFreeHumanGlyph(k.glyph), k.id).toBe(true)
  })
})

describe('the live Calendar', () => {
  const soon = new Date(Date.now() + 40 * 86_400_000).toISOString()
  const events = [{ id: 'a', slug: 'moon', title: 'Full moon gathering', startsAt: soon, location: 'The garden' }]
  it('hands the Space events to the view', () => {
    expect(draw('FreeHumanCalendar', {}, { links, space: { events } })).toContain('1 upcoming date')
    expect(draw('FreeHumanCalendar')).toContain('0 upcoming dates')
  })
  it('puts the hero feed link on the Space feed', () => {
    expect(draw('FreeHumanCalendarHero', {}, { links, space: { events } })).toContain('https://frequency.example/spaces/house/calendar.ics')
  })
})

describe('the Year Wheel block', () => {
  it('draws the wheel, the thread and the legend with its defaults', () => {
    const html = draw('FreeHumanYearWheel')
    expect(html).toContain('fhw-face')
    expect(html).toContain('Twelve signs, eight festivals, <em>every moon.</em>')
    expect(html).toContain('fhw-t-dot')
    expect(html).toContain('Our gatherings')
  })
  it('puts a Space gathering on the thread', () => {
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString()
    const html = draw('FreeHumanYearWheel', {}, { links, space: { events: [{ id: 'a', slug: 'moon', title: 'Full moon gathering', startsAt: soon }] } })
    expect(html).toContain('Full moon gathering')
  })
})

describe('the occurrences', () => {
  const now = new Date('2099-11-01T10:00:00Z')
  const rows = [
    { id: 'a', slug: 'moon', title: 'Full moon gathering', startsAt: '2099-11-05T18:00:00.000Z', location: ' Garden ' },
    { id: 'b', slug: 'x', title: 'Cancelled', startsAt: '2099-11-06T18:00:00.000Z', isCancelled: true },
    { id: 'c', slug: 'old', title: 'Past', startsAt: '2099-10-01T18:00:00.000Z' },
  ]
  it('drops cancelled and finished rows and trims the place', () => {
    const o = freeHumanOccurrences({ events: rows }, now, 13, (e) => `/e/${e.slug}`)
    expect(o.map((x) => x.id)).toEqual(['a'])
    expect(o[0].place).toBe('Garden')
    expect(o[0].href).toBe('/e/moon')
  })
  it('is empty without a Space', () => {
    expect(freeHumanOccurrences(undefined, now, 13, () => '')).toEqual([])
  })
})

describe('the month helpers', () => {
  const list = [occ('a', 'One', '2026-11-05T18:00'), occ('b', 'Two', '2026-11-05T19:00'), occ('c', 'Three', '2026-12-02T09:00')]
  it('rolls months across a year', () => {
    expect(freeHumanMonthAt('2026-11-15', 2)).toEqual({ year: 2027, month: 0 })
  })
  it('draws whole Sunday-first weeks and marks today', () => {
    const cells = freeHumanMonthCells(list, 2026, 10, '2026-11-05')
    expect(cells.length % 7).toBe(0)
    const day = cells.find((c) => c.key === '2026-11-05')!
    expect(day.count).toBe(2)
    expect(day.today).toBe(true)
  })
  it('counts dates in the strip and the agenda', () => {
    const strip = freeHumanMonthStrip(list, '2026-11-05', 3, () => 'x')
    expect(strip.map((s) => s.count)).toEqual([2, 1, 0])
    expect(strip[2].countLine).toBe('—')
    expect(freeHumanAgenda(list, 2026, 10)).toHaveLength(2)
  })
  it('shows a recurring series once', () => {
    const rec = [occ('a', 'Class', '2026-11-05T18:00', { recurring: true }), occ('b', 'Class', '2026-11-12T18:00', { recurring: true }), occ('c', 'Once', '2026-11-13T18:00')]
    expect(freeHumanCollapse(rec).map((o) => o.id)).toEqual(['a', 'c'])
  })
})

describe('the sky', () => {
  it('finds a full moon on a known full moon', () => {
    const m = freeHumanMoon(new Date('2026-10-26T12:00:00Z'))
    expect([4, 5, 3]).toContain(m.phase)
  })
  it('words the days to full', () => {
    expect(freeHumanMoon(new Date('2000-01-06T18:14:00Z')).nextLine).toMatch(/^Full in \d+ days$/)
  })
  it('maps months to the program seasons', () => {
    expect(freeHumanSeason(11).key).toBe('winter')
    expect(freeHumanSeason(3).module).toBe('Embody')
    expect(freeHumanSeason(9).key).toBe('autumn')
  })
})
