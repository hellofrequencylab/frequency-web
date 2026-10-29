import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { networkKitInnerComponents } from './network-kit-inner'
import { networkKitMoreComponents, NETWORK_KIT_MORE_CATEGORY_COMPONENTS } from './network-kit-more'
import { NETWORK_KIT_CATEGORY_COMPONENTS } from './network-kit'
import { withBands } from '@/lib/sites/network-kit-home'
import * as extras from '@/lib/sites/network-kit-extras'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { editorBlockMeta } from '@/lib/sites/editor/block-meta'
import { NETWORK_KIT_MORE_CSS } from '@/components/sites/network-kit-more-css'
import { NETWORK_KIT_CSS } from '@/components/sites/network-kit-css'

const links = { origin: 'https://frequency.example', slug: 'the-table', siteBase: '', pages: ['home', 'workshops', 'shop', 'resources', 'membership', 'about'], contactHref: '/contact', bookHref: null, email: 'hello@the-table.example' }
const row = (id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, title, startsAt, endsAt: startsAt.replace(/T\d\d/, 'T20'), ...extra })
const space = {
  events: [row('first-table', 'Friday morning table', '2099-11-18T09:30:00.000Z', { location: 'The courtyard' }), row('second-table', 'Members evening', '2099-11-20T18:00:00.000Z', { location: 'Harbor' })],
  highlights: [{ label: 'Members', value: 212 }, { label: 'Events', value: 14 }],
}
const metadata = { space, links }

function draw(type: string, props: Record<string, unknown>, md: Record<string, unknown> = metadata) {
  const component = networkKitMoreComponents[type]
  const el = (component.render as (p: Record<string, unknown>) => React.ReactNode)({ ...component.defaultProps, ...props, puck: { metadata: md } })
  return renderToStaticMarkup(<>{el}</>)
}

// The design's thirteen extra blocks, in its order (kits.js BLOCKS after the fourteen base ones).
const EXTRA = ['Featured', 'Venue', 'Calendar', 'Chapters', 'Circles', 'Stats', 'Note', 'Pillars', 'Rooms', 'Podcast', 'Social', 'Merch', 'Contact']

describe('the Network kit extra home blocks', () => {
  it('has one registered editor block for each of the design\'s thirteen extra blocks, beside the base fourteen', () => {
    expect(NETWORK_KIT_MORE_CATEGORY_COMPONENTS).toEqual(EXTRA.map((b) => 'NetworkKit' + b))
    expect(NETWORK_KIT_MORE_CATEGORY_COMPONENTS.some((t) => NETWORK_KIT_CATEGORY_COMPONENTS.includes(t))).toBe(false)
    const components = config.components as Record<string, { label?: string }>
    for (const type of NETWORK_KIT_MORE_CATEGORY_COMPONENTS) expect(components[type]?.label, type).toBeTruthy()
    expect(config.categories?.networkKit?.components).toEqual([...NETWORK_KIT_CATEGORY_COMPONENTS, ...NETWORK_KIT_MORE_CATEGORY_COMPONENTS, ...Object.keys(networkKitInnerComponents)])
  })

  it('offers them on the website palette only, and marks the ones that read the Space as live', () => {
    expect(categoryKeysForSurface('website')).toContain('networkKit')
    expect(categoryKeysForSurface('space')).not.toContain('networkKit')
    for (const type of NETWORK_KIT_MORE_CATEGORY_COMPONENTS) expect(editorBlockMeta(config, type).group, type).toMatch(/^(Sections|Live)$/)
    for (const t of ['Featured', 'Calendar', 'Stats']) expect(editorBlockMeta(config, 'NetworkKit' + t).live, t).toBe(true)
    expect(editorBlockMeta(config, 'NetworkKitCircles').live).toBe(false)
  })

  it('draws every block on its own defaults with the kit markup and no raw colour', () => {
    for (const type of NETWORK_KIT_MORE_CATEGORY_COMPONENTS) {
      const html = draw(type, {})
      if (type === 'NetworkKitStats') continue // draws only written or live figures; covered below
      expect(html, type).toContain('data-nk=')
      expect(html, type).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
  })

  it('shapes each block the way the design does', () => {
    expect(draw('NetworkKitFeatured', {})).toContain('nk-featured-media')
    expect(draw('NetworkKitFeatured', { flip: true })).toContain('data-flip')
    expect(draw('NetworkKitVenue', {})).toContain('nk-fact')
    expect(draw('NetworkKitChapters', {})).toContain('nk-band--ink')
    expect(draw('NetworkKitPodcast', {})).toContain('nk-band--ink')
    expect(draw('NetworkKitPodcast', {})).toContain('nk-play')
    expect(draw('NetworkKitCircles', {})).toContain('nk-circle-mark')
    expect(draw('NetworkKitRooms', { rooms: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }).match(/data-ink=""/g)).toHaveLength(1)
    expect(draw('NetworkKitSocial', {}).match(/nk-social-tile/g)).toHaveLength(4)
    expect(draw('NetworkKitPillars', {})).toContain('nk-pillars-closing')
    expect(draw('NetworkKitContact', {})).toContain('nk-contact-form')
    expect(draw('NetworkKitContact', {})).toContain('hello@the-table.example')
  })

  it('draws the next event, the dates and the figures from the Space own rows, and nothing it was not given', () => {
    const featured = draw('NetworkKitFeatured', {})
    expect(featured).toContain('Friday morning table')
    expect(featured).toContain('href="https://frequency.example/events/first-table"')
    expect(draw('NetworkKitFeatured', { showWhen: false })).not.toContain('nk-featured-when')
    expect(draw('NetworkKitFeatured', {}, { space: { events: [] }, links })).not.toContain('nk-featured-when')
    const cal = draw('NetworkKitCalendar', {})
    expect(cal).toContain('Friday morning table')
    expect(cal).toContain('Members evening')
    expect(draw('NetworkKitCalendar', {}, { space: { events: [] }, links })).toContain('No dates are up yet')
    const stats = draw('NetworkKitStats', {})
    expect(stats).toContain('212')
    expect(stats).toContain('Events')
    expect(draw('NetworkKitStats', { items: [{ value: '9', label: 'chapters' }] })).toContain('chapters')
    expect(draw('NetworkKitStats', {}, { space: { events: [] }, links })).toBe('')
    expect(draw('NetworkKitSocial', {})).not.toContain('nk-btn')
    expect(draw('NetworkKitSocial', { handle: '@thetable', url: 'https://instagram.com/thetable' })).toContain('@thetable')
  })

  it('leaves the lines out that have no words, and draws no price the owner did not write', () => {
    const rooms = draw('NetworkKitRooms', {})
    expect(rooms).not.toContain('nk-room-price')
    expect(draw('NetworkKitRooms', { rooms: [{ name: 'Hall', price: '$80', unit: 'hour' }] })).toContain('$80')
    expect(draw('NetworkKitMerch', {})).not.toContain('nk-merch-price')
    expect(draw('NetworkKitChapters', {})).not.toContain('members')
    expect(draw('NetworkKitNote', {})).not.toContain('nk-hosts')
  })

  it('keeps the plain blocks off the paper and sand rhythm, as the design does', () => {
    const seed = (types: string[]) => withBands(types.map((type) => ({ type, props: {} }))).map((b) => String(b.props.band))
    expect(seed(['NetworkKitHero', 'NetworkKitStats', 'NetworkKitVenue', 'NetworkKitFeatured', 'NetworkKitCalendar', 'NetworkKitChapters', 'NetworkKitCircles', 'NetworkKitPodcast', 'NetworkKitRooms'])).toEqual(['undefined', 'undefined', '', 'undefined', 'sand', 'undefined', '', 'undefined', 'sand'])
  })

  it('keeps the voice: no invented number, weekday promise, placeholder prompt or em dash in the starter words', () => {
    const words = JSON.stringify(Object.values(extras))
    expect(words).not.toMatch(/—/)
    expect(words).not.toMatch(/\d[\d,]*\+|\bmost fridays\b|\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b|\bweekly\b|\bunlock\b|\bcohort\b|\bEp\. \d|\$\d/i)
    expect(words).not.toMatch(/\b(say how|one line|one sentence|your city|sample|add your)\b/i)
  })

  it('names no raw colour and is scoped under the kit attribute, inside the kit skin', () => {
    expect(NETWORK_KIT_CSS).toContain(NETWORK_KIT_MORE_CSS)
    expect(NETWORK_KIT_MORE_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(NETWORK_KIT_MORE_CSS).not.toMatch(/(?<![-\w])(black|white)(?![-\w])/)
    const selectors = NETWORK_KIT_MORE_CSS.split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{\s*/, '').trim()).filter((r) => r && !r.startsWith('/*'))
    for (const r of selectors) expect(r.split('{')[0]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(), r.slice(0, 80)).toContain('data-house-theme="network-kit"')
    expect(NETWORK_KIT_MORE_CSS).not.toMatch(/violet|text-transform:uppercase/)
  })
})
