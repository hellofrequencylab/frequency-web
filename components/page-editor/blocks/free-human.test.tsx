import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { freeHumanBlocks } from './free-human'
import { freeHumanHomeBlocks } from '@/lib/sites/free-human-home'
import { hasFreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { FREE_HUMAN_PHOTOS } from '@/lib/sites/free-human-photos'
import { freeHumanKind, freeHumanStamp, freeHumanDayLine, freeHumanUpcoming } from '@/lib/sites/free-human-events'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home', 'program', 'calendar'], contactHref: '/contact', bookHref: null, email: null }
const draw = (type: string, props: Record<string, unknown> = {}, metadata: Record<string, unknown> = { links }) => {
  const c = freeHumanBlocks[type]
  return renderToStaticMarkup(<>{(c.render as (p: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...props, puck: { metadata } })}</>)
}

describe('the Free Human Home seed', () => {
  it('is the design order and every block type is registered', () => {
    const types = freeHumanHomeBlocks().map((b) => b.type)
    expect(types).toEqual(['FreeHumanHero', 'FreeHumanSeasons', 'FreeHumanLyric', 'FreeHumanWorkshops', 'FreeHumanEvents', 'FreeHumanBooks', 'FreeHumanSpeaking', 'FreeHumanLineage'])
    for (const t of types) expect(freeHumanBlocks[t]).toBeTruthy()
  })
  it('names only marks and photos that exist', () => {
    const json = JSON.stringify(freeHumanHomeBlocks())
    for (const m of json.matchAll(/"glyph":"([^"]+)"/g)) expect(hasFreeHumanGlyph(m[1]), m[1]).toBe(true)
    const known = new Set(Object.values(FREE_HUMAN_PHOTOS).map((p) => (p as { src?: string }).src).filter(Boolean))
    for (const m of json.matchAll(/"(?:image|accentImage)":"([^"]+)"/g)) expect(m[1].startsWith('/sites/free-human/photos/') || known.has(m[1]), m[1]).toBe(true)
  })
  it('draws every block with its defaults', () => {
    for (const b of freeHumanHomeBlocks()) {
      const html = draw(b.type)
      expect(html.length, b.type).toBeGreaterThan(200)
      expect(html).toContain('fh-sec')
    }
  })
})

describe('the grounds', () => {
  it('maps ground, edge and texture to the foundation classes, light textures on night', () => {
    const html = draw('FreeHumanLyric', { ground: 'night', edge: 'flow-top', texture: 'fire', wander: false })
    expect(html).toContain('fh-sanctuary')
    expect(html).toContain('fh-flow-t')
    expect(html).toContain('fh-tex-fire-light')
    expect(html).not.toContain('fh-wander')
  })
  it('falls back to day on an unknown ground', () => {
    expect(draw('FreeHumanLyric', { ground: 'nope' })).toContain('fh-lazure')
  })
})

describe('the live blocks', () => {
  const events = [
    { id: 'a', slug: 'moon', title: 'Full moon gathering', startsAt: '2099-11-05T18:00:00.000Z', location: 'The garden' },
    { id: 'b', slug: 'breath', title: 'Breath workshop', startsAt: '2099-11-15T15:00:00.000Z', description: 'Three hours.' },
    { id: 'c', slug: 'gone', title: 'Cancelled workshop', startsAt: '2099-11-20T15:00:00.000Z', isCancelled: true },
  ]
  it('draws the Space events over the seed rows, linked, with the numeral', () => {
    const html = draw('FreeHumanEvents', {}, { links, space: { events } })
    expect(html).toContain('Full moon gathering')
    expect(html).toContain('>05<')
    expect(html).toContain('NOV')
    expect(html).toContain('href="https://frequency.example/events/moon"')
    expect(html).not.toContain('Cancelled workshop')
    expect(html).not.toContain('Solstice retreat')
  })
  it('filters workshops by kind', () => {
    const html = draw('FreeHumanWorkshops', { tag: 'workshop' }, { links, space: { events } })
    expect(html).toContain('Breath workshop')
    expect(html).toContain('Sun · Nov 15')
    expect(html).not.toContain('Full moon gathering')
  })
  it('shows the empty line when the Space has no events, and the seed when there is no Space', () => {
    expect(draw('FreeHumanEvents', { rows: [] }, { links, space: { events: [] } })).toContain('No dates are open')
    expect(draw('FreeHumanEvents')).toContain('Solstice retreat')
  })
  it('shows the glyph where a seed row has no day', () => {
    expect(draw('FreeHumanEvents')).not.toContain('fh-event-day')
  })
})

describe('the event lines', () => {
  it('reads the kind from the title', () => {
    expect(freeHumanKind('Full moon gathering').id).toBe('moon')
    expect(freeHumanKind('Solstice retreat').id).toBe('retreat')
    expect(freeHumanKind('Tuesday circle').id).toBe('circle')
  })
  it('stamps and day lines read the stored wall clock', () => {
    expect(freeHumanStamp('2099-11-05T18:00:00.000Z')).toEqual({ day: '05', month: 'NOV' })
    expect(freeHumanDayLine('2099-11-15T15:00:00.000Z')).toBe('Sun · Nov 15')
    expect(freeHumanStamp('nope')).toBeNull()
  })
  it('is empty for no Space', () => {
    expect(freeHumanUpcoming(undefined, new Date())).toEqual([])
  })
})

describe('the speaking section', () => {
  it('draws the booking form with the kinds and a honeypot', () => {
    const html = draw('FreeHumanSpeaking')
    expect(html).toContain('Conference or summit')
    expect(html).toContain('name="company"')
    expect(html).toContain('Request a booking')
  })
})
