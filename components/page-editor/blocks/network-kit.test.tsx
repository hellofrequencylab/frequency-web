import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { networkKitComponents, NETWORK_KIT_CATEGORY_COMPONENTS } from './network-kit'
import { networkKitHomeBlocks } from '@/lib/sites/network-kit-home'
import { websiteTemplateSections } from '@/lib/sites/editor/templates'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { editorBlockMeta } from '@/lib/sites/editor/block-meta'
import { NETWORK_KIT_BLOCKS_CSS } from '@/components/sites/network-kit-blocks-css'

const links = { origin: 'https://frequency.example', slug: 'the-table', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }
const row = (id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, title, startsAt, endsAt: startsAt.replace(/T\d\d/, 'T20'), ...extra })

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown>) {
  const component = networkKitComponents[type]
  const el = (component.render as (p: Record<string, unknown>) => React.ReactNode)({ ...component.defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

// The design's fourteen base blocks (HomePage.jsx BLOCK_VIEWS): every one is an editor block.
const BASE_BLOCKS = ['Hero', 'Live', 'Steps', 'Doors', 'Offerings', 'Journeys', 'Gatherings', 'Membership', 'Proof', 'Shop', 'Library', 'Letter', 'FAQ', 'CTA']

// The layout variants the design's kits choose between (kits.js `layouts`, HomePage.jsx `LAY`).
const VARIANTS: Record<string, string[]> = {
  Hero: ['split', 'full', 'center', 'left'],
  Steps: ['grid', 'timeline', 'strip'],
  Doors: ['grid', 'list', 'tiles'],
  Offerings: ['list', 'cards', 'split'],
  Journeys: ['cards', 'feature'],
  Gatherings: ['split', 'calendar', 'cards'],
  Membership: ['tiers', 'table', 'spotlight'],
  Proof: ['quote', 'wall', 'stats'],
  Shop: ['grid', 'rail'],
  Library: ['grid', 'list'],
  Letter: ['band', 'card'],
  FAQ: ['split', 'stack'],
  CTA: ['center', 'split', 'band'],
}

const space = {
  events: [row('first-table', 'Friday morning table', '2099-11-18T09:30:00.000Z', { priceLabel: '$20', location: 'The courtyard' }), row('second-table', 'Members evening', '2099-11-20T18:00:00.000Z', { location: 'Harbor' })],
  series: [],
  practices: { journeys: [{ id: 'j1', slug: 'host', title: 'Host training', summary: 'Run a meetup people come back to.', adoptCount: 12 }] },
  reviews: { average: 4.8, count: 20, latest: [{ id: 'r1', rating: 5, body: 'I came for one coffee and stayed.', author: { displayName: 'Sam O.' } }, { id: 'r2', rating: 5, body: 'Nobody pitched.', author: { displayName: 'Jo K.' } }] },
  faqs: [{ id: 'f1', question: 'Is there parking?', answer: 'On the street.' }],
  highlights: [{ label: 'Members', value: 212 }],
}
const metadata = { space, links }

describe('the Network kit home blocks', () => {
  it('has one registered editor block for each of the design\'s fourteen base blocks', () => {
    expect(NETWORK_KIT_CATEGORY_COMPONENTS).toEqual(BASE_BLOCKS.map((b) => 'NetworkKit' + b))
    for (const type of NETWORK_KIT_CATEGORY_COMPONENTS) expect((config.components as Record<string, { label?: string }>)[type]?.label, type).toBeTruthy()
  })

  it('puts the family on the website palette only, in the Sections or Live group', () => {
    expect(categoryKeysForSurface('website')).toContain('networkKit')
    expect(categoryKeysForSurface('space')).not.toContain('networkKit')
    expect(categoryKeysForSurface('marketing')).not.toContain('networkKit')
    for (const type of NETWORK_KIT_CATEGORY_COMPONENTS) expect(editorBlockMeta(config, type).group, type).toMatch(/^(Sections|Live)$/)
  })

  it('draws every block on its own defaults, with the kit markup and no raw colour', () => {
    for (const type of NETWORK_KIT_CATEGORY_COMPONENTS) {
      const html = draw(type, {}, { space, links })
      if (type === 'NetworkKitProof') continue // draws only a written or a live quote; covered below
      expect(html, type).toContain('data-nk=')
      expect(html, type).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
  })

  it('draws a different layout for every variant the design names, and keeps its shared content', () => {
    for (const [name, variants] of Object.entries(VARIANTS)) {
      const type = `NetworkKit${name}`
      const drawn = variants.map((v) => draw(type, { variant: v }, metadata))
      drawn.forEach((html, i) => expect(html, `${type} ${variants[i]}`).toContain(`data-variant="${variants[i]}"`))
      expect(new Set(drawn).size, `${type} variants differ`).toBe(variants.length)
    }
  })

  it('falls back to the first variant when the stored one is not one of the design\'s', () => {
    expect(draw('NetworkKitSteps', { variant: 'zigzag' }, metadata)).toContain('data-variant="grid"')
    expect(draw('NetworkKitHero', { variant: 'banner' }, metadata)).toContain('data-variant="split"')
  })

  it('shapes each variant the way the design does', () => {
    const steps = (v: string) => draw('NetworkKitSteps', { variant: v }, metadata)
    expect(steps('timeline')).toContain('nk-timeline')
    expect(steps('timeline')).toContain('Step 01')
    expect(steps('strip')).toContain('nk-steps-strip')
    expect(steps('grid')).toContain('nk-steps-grid')
    expect(draw('NetworkKitDoors', { variant: 'tiles' }, metadata)).toContain('nk-door--tile')
    expect(draw('NetworkKitDoors', { variant: 'list' }, metadata)).toContain('nk-door-row')
    expect(draw('NetworkKitGatherings', { variant: 'calendar' }, metadata)).toContain('nk-cal-row')
    expect(draw('NetworkKitGatherings', { variant: 'cards', image: '/sites/network-kit/photos/photo-07.jpg' }, metadata)).toContain('nk-event-card')
    expect(draw('NetworkKitMembership', { variant: 'table' }, metadata)).toContain('nk-table-row')
    expect(draw('NetworkKitMembership', { variant: 'spotlight' }, metadata)).toContain('nk-tier-spot')
    expect(draw('NetworkKitShop', { variant: 'rail' }, metadata)).toContain('nk-rail')
    expect(draw('NetworkKitFAQ', { variant: 'stack' }, metadata)).toContain('nk-faq-stack')
    expect(draw('NetworkKitCTA', { variant: 'band' }, metadata)).toContain('nk-cta-band')
    expect(draw('NetworkKitCTA', { variant: 'split', secondaryLabel: 'Say hello', secondaryHref: '~/contact' }, metadata)).toContain('Say hello')
  })

  it('holds the hero\'s leaf photo, flip and event card to the design', () => {
    const split = draw('NetworkKitHero', {}, metadata)
    expect(split).toContain('nk-hero-media')
    expect(split).toContain('nk-hero-event')
    expect(split).toContain('Friday morning table')
    expect(draw('NetworkKitHero', { flip: true }, metadata)).toContain('data-flip')
    expect(draw('NetworkKitHero', { showEvent: false }, metadata)).not.toContain('nk-hero-event')
    const photo = draw('NetworkKitHero', { variant: 'full' }, metadata)
    expect(photo).toContain('nk-leaf')
    expect(photo).not.toContain('nk-hero-event')
    expect(photo).toContain('nk-btn--glass')
    expect(split).toContain('nk-btn--secondary')
  })

  it('draws the strip, the rows and the quote from the Space own rows, and links through the site map', () => {
    const strip = draw('NetworkKitLive', {}, metadata)
    expect(strip).toContain('Friday morning table')
    expect(strip).toContain('1 open')
    expect(strip).toContain('212 in the group')
    expect(draw('NetworkKitGatherings', {}, { ...metadata }).replace(/\s+/g, ' ')).toContain('href="https://frequency.example/events/first-table"')
    expect(draw('NetworkKitJourneys', {}, metadata)).toContain('Host training')
    expect(draw('NetworkKitJourneys', {}, metadata)).not.toContain('Grow a chapter from 10 to 40')
    const proof = draw('NetworkKitProof', {}, metadata)
    expect(proof).toContain('I came for one coffee and stayed.')
    expect(proof).toContain('4.8 from 20 reviews')
    expect(draw('NetworkKitProof', { variant: 'wall' }, metadata)).toContain('Nobody pitched.')
    const stats = draw('NetworkKitProof', { variant: 'stats' }, metadata)
    expect(stats).toContain('212')
    expect(stats).toContain('Members')
  })

  it('draws no event, quote or figure it was not given', () => {
    const empty = { space: { events: [], series: [] }, links }
    expect(draw('NetworkKitLive', {}, empty)).toContain('Welcome calls')
    expect(draw('NetworkKitLive', {}, empty)).not.toContain('Next meetup')
    expect(draw('NetworkKitHero', {}, empty)).not.toContain('nk-hero-event')
    expect(draw('NetworkKitProof', {}, empty)).toBe('')
    expect(draw('NetworkKitProof', { variant: 'stats', quote: 'A written quote.' }, empty)).not.toContain('nk-stat-grid')
    expect(draw('NetworkKitGatherings', {}, empty)).toContain('No dates are up yet')
    const cancelled = { space: { events: [row('x', 'Cancelled table', '2099-11-18T09:30:00.000Z', { isCancelled: true })], series: [] }, links }
    expect(draw('NetworkKitGatherings', {}, cancelled)).not.toContain('Cancelled table')
  })

  it('uses the Space questions over its own list, with the first one open', () => {
    const live = draw('NetworkKitFAQ', {}, metadata)
    expect(live).toContain('Is there parking?')
    expect(live).not.toContain('Who is this for?')
    expect(live).toContain('<details name="nk-faq" open="">')
  })

  it('is planned as own renders, the hero first, and opens the Network kit Program template', () => {
    const plan = planMensworkPage(networkKitHomeBlocks())
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
    expect(plan.map((p) => ('hero' in p ? p.hero : false))[0]).toBe(true)
    expect(websiteTemplateSections('NetworkKit', 'Program').map((b) => b.type)).toEqual(networkKitHomeBlocks().map((b) => b.type))
    expect(websiteTemplateSections('Network', 'Program').map((b) => b.type)).not.toContain('NetworkKitHero')
  })

  it('alternates paper and sand down the page after the hero and the strip, as the design does', () => {
    const bands = networkKitHomeBlocks().map((b) => String(b.props.band))
    expect(bands.slice(0, 2)).toEqual(['', ''])
    expect(bands.slice(2, 6)).toEqual(['', 'sand', '', 'sand'])
    expect(draw('NetworkKitSteps', { band: 'sand' }, metadata)).toContain('nk-band--sand')
    expect(draw('NetworkKitSteps', { band: '' }, metadata)).not.toContain('nk-band--sand')
  })

  it('keeps the voice: no invented number, weekday promise, placeholder prompt or em dash in the starter words', () => {
    const words = JSON.stringify(networkKitHomeBlocks())
    expect(words).not.toMatch(/—/)
    expect(words).not.toMatch(/\d[\d,]*\+|\b4\.9\b|\bmost fridays\b|\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b|\bweekly\b|\bone email a week\b|\bunlock\b/i)
    expect(words).not.toMatch(/\b(say how|one line|one sentence|your city|sample)\b/i)
  })

  it('names no raw colour and is scoped under the kit attribute', () => {
    expect(NETWORK_KIT_BLOCKS_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(NETWORK_KIT_BLOCKS_CSS).not.toMatch(/(?<![-\w])(black|white)(?![-\w])/)
    const selectors = NETWORK_KIT_BLOCKS_CSS.split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{\s*/, '').trim()).filter((r) => r && !r.startsWith('/*'))
    for (const r of selectors) expect(r.split('{')[0]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(), r.slice(0, 80)).toContain('data-house-theme="network-kit"')
    expect(NETWORK_KIT_BLOCKS_CSS).not.toMatch(/violet|text-transform:uppercase/)
  })
})
