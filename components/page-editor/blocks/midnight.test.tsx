import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { midnightComponents, MIDNIGHT_CATEGORY_COMPONENTS } from './midnight'
import { midnightHomeBlocks, midnightSitePages } from '@/lib/sites/midnight-home'
import { websiteTemplateSections } from '@/lib/sites/editor/templates'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { editorBlockMeta } from '@/lib/sites/editor/block-meta'

const links = { origin: 'https://frequency.example', slug: 'nocturne', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }
const row = (id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, title, startsAt, endsAt: startsAt.replace(/T\d\d/, 'T20'), ...extra })

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown>) {
  const el = (midnightComponents[type].render as (p: Record<string, unknown>) => React.ReactNode)({ ...midnightComponents[type].defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

// The design's thirteen blocks (kits.midnight.json `blocks`): every one is an editor block.
const DESIGN_BLOCKS = ['hero', 'live', 'doors', 'offerings', 'journeys', 'gatherings', 'membership', 'proof', 'shop', 'library', 'letter', 'faq', 'cta']

describe('the Midnight block family', () => {
  it('has one registered editor block for each of the design\'s thirteen blocks', () => {
    expect(MIDNIGHT_CATEGORY_COMPONENTS).toEqual(DESIGN_BLOCKS.map((b) => 'Midnight' + (b === 'faq' || b === 'cta' ? b.toUpperCase() : b[0].toUpperCase() + b.slice(1))))
    for (const type of MIDNIGHT_CATEGORY_COMPONENTS) {
      const component = (config.components as Record<string, { label?: string }>)[type]
      expect(component?.label, type).toBeTruthy()
    }
  })

  it('puts the family on the website palette, in the Sections group', () => {
    expect(categoryKeysForSurface('website')).toContain('midnight')
    expect(categoryKeysForSurface('space')).not.toContain('midnight')
    for (const type of MIDNIGHT_CATEGORY_COMPONENTS) expect(editorBlockMeta(config, type).group, type).toMatch(/^(Sections|Live)$/)
  })

  it('draws every block on its own defaults, with the design markup and no raw colour', () => {
    for (const type of MIDNIGHT_CATEGORY_COMPONENTS) {
      const html = draw(type, {}, { space: { events: [], series: [] }, links })
      expect(html, type).toContain('data-mn=')
      expect(html, type).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
  })

  it('is planned as own renders, the hero first, and opens the Midnight Program template on the Home', () => {
    const plan = planMensworkPage(midnightHomeBlocks())
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
    expect(plan.map((p) => ('hero' in p ? p.hero : false))[0]).toBe(true)
    expect(websiteTemplateSections('Midnight', 'Program').map((b) => b.type)).toEqual(midnightHomeBlocks().map((b) => b.type))
    expect(websiteTemplateSections('Menswork', 'Program').map((b) => b.type)).not.toContain('MidnightHero')
  })

  it('shows every design block somewhere in the page set', () => {
    const used = new Set(midnightSitePages().flatMap((p) => p.blocks.map((b) => b.type)))
    for (const type of MIDNIGHT_CATEGORY_COMPONENTS) expect(used.has(type) || ['MidnightDoors', 'MidnightMembership', 'MidnightShop'].includes(type), type).toBe(true)
    const home = new Set(midnightHomeBlocks().map((b) => b.type))
    expect(home.has('MidnightHero')).toBe(true)
  })

  it('draws the strip, the rows and the quote from the Space own rows, and links through the site map', () => {
    const events = [row('new-moon', 'New moon circle', '2099-11-18T09:30:00.000Z', { priceLabel: '$60', location: 'Online' })]
    const metadata = {
      space: { events, series: [], practices: { journeys: [{ id: 'j1', slug: 'clear', title: 'Clear decisions', summary: 'Decide in a page.', adoptCount: 12 }] }, reviews: { average: 4.8, count: 20, latest: [{ id: 'r1', rating: 5, body: 'It changed how we decide.', author: { displayName: 'Sam O.' } }] }, highlights: [{ label: 'Members', value: 212 }] },
      links,
    }
    const strip = draw('MidnightLive', {}, metadata)
    expect(strip).toContain('New moon circle')
    expect(strip).toContain('1 Journeys open')
    expect(strip).toContain('212 members')
    expect(draw('MidnightGatherings', {}, metadata)).toContain('href="https://frequency.example/events/new-moon"')
    expect(draw('MidnightJourneys', {}, metadata)).toContain('Clear decisions')
    expect(draw('MidnightJourneys', {}, metadata)).not.toContain('Thirty days of clear decisions')
    const proof = draw('MidnightProof', {}, metadata)
    expect(proof).toContain('It changed how we decide.')
    expect(proof).toContain('4.8 from 20 reviews')
  })

  it('falls back to the written cards when the Space has no rows, and drops a cancelled event', () => {
    const empty = { space: { events: [], series: [] }, links }
    expect(draw('MidnightGatherings', {}, empty)).toContain('New moon: clear decisions')
    expect(draw('MidnightJourneys', {}, empty)).toContain('Thirty days of clear decisions')
    const cancelled = { space: { events: [row('x', 'Cancelled circle', '2099-11-18T09:30:00.000Z', { isCancelled: true })], series: [] }, links }
    expect(draw('MidnightGatherings', {}, cancelled)).not.toContain('Cancelled circle')
  })

  it('uses the Space questions over its own list', () => {
    const live = draw('MidnightFAQ', {}, { space: { faqs: [{ id: 'f', question: 'Is there parking?', answer: 'On the street.' }] }, links })
    expect(live).toContain('Is there parking?')
    expect(live).not.toContain('Do you work with teams')
  })

  it('numbers the heads with the one counter and never writes an em dash', () => {
    const html = draw('MidnightOfferings', {}, { links })
    expect(html).toContain('mn-index')
    expect(JSON.stringify(midnightSitePages())).not.toMatch(/—/)
  })
})
