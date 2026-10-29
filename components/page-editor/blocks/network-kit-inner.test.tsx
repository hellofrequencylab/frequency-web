import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { networkKitInnerComponents } from './network-kit-inner'
import { networkKitMoreComponents } from './network-kit-more'
import { networkKitInnerPagesA } from '@/components/sites/network-kit-inner/pages'
import { bindSlots } from '@/lib/spaces/content-slots'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'

const ALL = { ...networkKitInnerComponents, ...networkKitMoreComponents }
const links = { origin: 'https://frequency.example', slug: 'harbor', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: 'hello@harbor.example' }

function draw(type: string, props: Record<string, unknown>, space: Record<string, unknown> = {}) {
  const cfg = ALL[type]
  const el = (cfg.render as (p: Record<string, unknown>) => React.ReactNode)({ ...cfg.defaultProps, ...props, puck: { metadata: { links, space } } })
  return renderToStaticMarkup(<>{el}</>)
}

describe('the Network Kit inner blocks (pass A)', () => {
  it('are drawn by the site plan as its own render', () => {
    const types = Object.keys(networkKitInnerComponents)
    const plan = planMensworkPage(types.map((type, i) => ({ type, props: { id: `b${i}` } })) as MwBlock[])
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
  })

  it('draws every inner page block from the kit words', () => {
    for (const pg of networkKitInnerPagesA()) {
      for (const b of pg.blocks) {
        if (!b.type.startsWith('NetworkKitInner')) continue
        const props = bindSlots({ id: 'x', ...b.props }, {})
        expect(draw(b.type, props).length, `${pg.slug}/${b.type}`).toBeGreaterThan(80)
      }
    }
  })

  it('sets the story as an arch photo beside the prose, the first paragraph set apart', () => {
    const about = networkKitInnerPagesA().find((p) => p.slug === 'about')!
    const story = about.blocks.find((b) => b.type === 'NetworkKitInnerStory')!
    const html = draw('NetworkKitInnerStory', bindSlots({ id: 's', ...story.props }, {}))
    expect(html).toContain('nki-arch')
    expect(html).toContain('<em>minus the awkward</em>')
    expect(html).toContain('data-first=""')
  })

  it('draws service rows that alternate sides, with numbered labels and a button only when it has somewhere to go', () => {
    const html = draw('NetworkKitInnerServices', { rows: [{ title: 'One', ctaLabel: 'Enquire', ctaHref: '~/contact', price: 'Included' }, { title: 'Two' }] })
    expect(html).toContain('>01<')
    expect(html).toContain('>02<')
    expect(html.match(/data-flip=""/g)?.length).toBe(1)
    expect(html.match(/Enquire/g)?.length).toBe(1)
  })

  it('draws the live events as cards, split into online and in person tabs, and the owner cards when there are none', () => {
    const live = { events: [
      { id: 'e1', slug: 'a', title: 'Morning table', startsAt: '2099-11-14T09:00:00', location: 'The courtyard' },
      { id: 'e2', slug: 'b', title: 'Welcome call', startsAt: '2099-11-19T12:00:00', location: 'Online' },
    ] }
    const html = draw('NetworkKitInnerIndex', { variant: 'meetups', countNoun: 'upcoming', allLabel: 'All', tabs: 'Online\nIn person' }, live)
    expect(html).toContain('2 upcoming')
    expect(html).toContain('Morning table')
    expect(html).toContain('>Online<')
    expect(html).toContain('>In person<')
    const own = draw('NetworkKitInnerIndex', { variant: 'programs', countNoun: 'programs', tabs: 'Runs', items: [{ title: 'Host training', group: 'Runs', note: 'Runs with a group' }] })
    expect(own).toContain('Host training')
    expect(own).toContain('1 programs')
  })

  it('draws the figures with a photo beside them, and nothing when there are no numbers', () => {
    const html = draw('NetworkKitStats', { variant: 'photo', image: '/sites/network-kit/photos/photo-07.jpg', items: [{ value: '6', label: 'Chapters' }] })
    expect(html).toContain('nki-figures')
    expect(html).toContain('Chapters')
    expect(draw('NetworkKitStats', { variant: 'photo', items: [] })).toBe('')
  })
})
