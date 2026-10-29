import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeKitInnerComponents } from './temple-kit-inner'
import { templeKitInnerPagesA } from '@/components/sites/temple-kit-inner/pages'
import { bindSlots } from '@/lib/spaces/content-slots'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: 'hello@house.example' }

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown> = { links }) {
  const el = (templeKitInnerComponents[type].render as (p: Record<string, unknown>) => React.ReactNode)({ ...templeKitInnerComponents[type].defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

describe('the Temple Kit inner blocks (group A)', () => {
  it('names every block TempleKitInner<Part>, which the site plan draws as its own render', () => {
    const types = Object.keys(templeKitInnerComponents)
    expect(types.every((t) => t.startsWith('TempleKitInner'))).toBe(true)
    const plan = planMensworkPage(types.map((type, i) => ({ type, props: { id: `b${i}` } })) as MwBlock[])
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
  })

  it('draws the three group A pages from the kit words, with no block left unregistered', () => {
    for (const pg of templeKitInnerPagesA()) {
      for (const b of pg.blocks) {
        if (b.type.startsWith('TempleKitInner')) {
          const props = bindSlots({ id: 'x', ...b.props }, {})
          expect(draw(b.type, props).length, `${pg.slug}/${b.type}`).toBeGreaterThan(40)
        }
      }
    }
  })

  it('sets starred words in the accent italic and uses the kit words for About', () => {
    const about = templeKitInnerPagesA().find((p) => p.slug === 'about')!
    const hero = draw('TempleKitInnerHero', bindSlots({ id: 'h', ...about.blocks[0].props }, {}))
    expect(hero).toContain('Two acres, <em>kept quietly.</em>')
    const team = draw('TempleKitInnerTeam', bindSlots({ id: 't', ...about.blocks[2].props }, {}))
    expect(team).toContain('Ines Aldana')
    expect(team).toContain('>IA<')
  })

  it('reads the owner facts a slot holds over the kit sample words', () => {
    const about = templeKitInnerPagesA().find((p) => p.slug === 'about')!
    const team = draw('TempleKitInnerTeam', bindSlots({ id: 't', ...about.blocks[2].props }, { person1Name: 'Dana Reyes' }))
    expect(team).toContain('Dana Reyes')
    expect(team).not.toContain('Ines Aldana')
  })

  it('draws a service row without a photo as the kit wash, and links its button through the site map', () => {
    const html = draw('TempleKitInnerService', { title: 'Ceremonies', ctaLabel: 'Hold a date', ctaHref: '~/contact', points: 'One\nTwo', note: 'From $2,400' })
    expect(html).toContain('tki-service-media tki-bare')
    expect(html).not.toContain('background-image')
    expect(html).toContain('href="/contact"')
    expect(html.match(/<li>/g)).toHaveLength(2)
  })

  it('draws the questions as an accordion, the first open, and the Space own questions over the kit ones', () => {
    const items = [{ q: 'One?', a: 'Yes.' }, { q: 'Two?', a: 'No.' }]
    const html = draw('TempleKitInnerFaq', { title: 'Common *questions*', items }, { links })
    expect(html).toContain('<details open="">')
    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html).toContain('Common <em>questions</em>')
    const own = draw('TempleKitInnerFaq', { items }, { links, space: { faqs: [{ question: 'Mine?', answer: 'Mine.' }] } })
    expect(own).toContain('Mine?')
    expect(own).not.toContain('One?')
    expect(draw('TempleKitInnerFaq', { items: [] }, { links })).toBe('')
  })

  it('draws nothing for a team or numbers block that has nothing to show', () => {
    expect(draw('TempleKitInnerTeam', { people: [] })).toBe('')
    expect(draw('TempleKitInnerStats', { stats: [] })).toBe('')
  })

  it('reads the contact email and address off Business Info when the block leaves them empty', () => {
    const html = draw('TempleKitInnerContact', { title: 'Write *to us.*' }, { links, space: { profile: { email: 'hi@house.example', address: 'Ojai, California' } } })
    expect(html).toContain('hi@house.example')
    expect(html).toContain('Ojai, California')
    expect(html).toContain('Write <em>to us.</em>')
  })

  it('keeps the contact form inert in the editor preview (no slug)', () => {
    const html = draw('TempleKitInnerContact', { title: 'Write to us.' }, {})
    expect(html).toContain('disabled')
  })
})
