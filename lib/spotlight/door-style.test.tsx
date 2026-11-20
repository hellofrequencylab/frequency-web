import { describe, expect, it } from 'vitest'
import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { doorRuns, linkDoorStyle, mainLink } from './door-style'
import { overlaySpaceOnKit, spaceFactsFromGrid } from './space-kit-page'
import { servicesKitSpotlightContent } from './services-kit-content'
import { templeKitSpotlightContent } from './temple-kit-content'
import { houseKitSpotlightContent } from './house-kit-content'
import { cyberwitchSpacePage } from './cyberwitch-space-page'
import { mindlessSpacePage } from './mindless-space-page'
import { ServicesKitSpotlightLayout } from '@/components/spotlight/services-kit-layouts'
import { TempleKitSpotlightLayout } from '@/components/spotlight/temple-kit-layouts'
import { HouseKitSpotlightLayout } from '@/components/spotlight/house-kit-layouts'
import { CyberWitchKitSpotlightLayout } from '@/components/spotlight/cyberwitch-kit-layouts'
import { MindlessKitSpotlightLayout } from '@/components/spotlight/mindless-kit-layouts'

// LIVE-2487: the owner's link styles and main-button pick work on every Spotlight theme, not only New World.

const base = { slug: 'dan', name: 'Dan', tagline: 'Alchemy' }
const LINKS = [
  { label: 'Launch your biz', url: 'https://frequencylocal.com/launch-your-business', style: 'text' },
  { label: 'Frequency Beta', url: 'https://frequencylocal.com/join' },
  { label: 'My site', url: 'https://danieltyack.com', style: 'button' },
  { label: 'Instagram', url: 'https://instagram.com/dan', style: 'text' },
]
const space = (theme: string) => ({
  slug: 'dan', name: 'Dan', brandName: null, brandAccent: null, brandLogoUrl: null, preferences: { siteStyle: { theme } },
}) as unknown as Parameters<typeof cyberwitchSpacePage>[0]

describe('the shared door rules', () => {
  it('reads a link style over the block default and never treats main as a door style', () => {
    expect(linkDoorStyle({ style: 'text' }, 'button')).toBe('text')
    expect(linkDoorStyle({}, 'button')).toBe('button')
    expect(linkDoorStyle({ style: 'main' })).toBeUndefined()
  })
  it('picks the marked link, else the first that is neither a text link nor a card', () => {
    expect(mainLink(LINKS)?.label).toBe('Frequency Beta')
    expect(mainLink([...LINKS, { label: 'Pick me', url: 'https://x.example', style: 'main' }])?.label).toBe('Pick me')
    expect(mainLink([{ label: 'a', url: 'https://a.example' }] as { label: string; url: string; style?: string }[], 'text')).toBeNull()
  })
  it('groups doors in order by style', () => {
    expect(doorRuns([{ style: 'text' as const }, { style: 'text' as const }, {}, { style: 'button' as const }]).map((r) => [r.kind, r.doors.length]))
      .toEqual([['text', 2], ['card', 1], ['button', 1]])
  })
})

describe('kit themes (Services, Temple, Designer, Free Human, Network, Bold, Wildheart, Nocturne)', () => {
  const facts = spaceFactsFromGrid(base, { links: { items: LINKS } })
  it('never make a text link the main button', () => {
    const c = overlaySpaceOnKit(servicesKitSpotlightContent('general', { sample: false }), facts)
    expect(c.cta).toEqual({ label: 'Frequency Beta', href: 'https://frequencylocal.com/join' })
    expect(c.doors.map((d) => [d.title, d.style])).toEqual([['Launch your biz', 'text'], ['My site', 'button'], ['Instagram', 'text']])
  })
  it('make the marked link the button and leave it out of the doors', () => {
    const marked = spaceFactsFromGrid(base, { links: { items: [{ label: 'A', url: 'https://a.example' }, { label: 'B', url: 'https://b.example', style: 'main' }] } })
    const c = overlaySpaceOnKit(templeKitSpotlightContent('general', { sample: false }), marked)
    expect(c.cta).toEqual({ label: 'B', href: 'https://b.example' })
    expect(c.doors.map((d) => d.title)).toEqual(['A'])
  })
  it('draw text links as a plain row and buttons as buttons, not cards', () => {
    const svc = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:stack" content={{ ...overlaySpaceOnKit(servicesKitSpotlightContent('general', { sample: false }), facts), owner: 'Dan', role: '', story: '' }} />)
    expect(svc).toMatch(/<div class="col-span-full[^"]*"><a style="text-decoration:underline;text-underline-offset:4px" href="https:\/\/frequencylocal.com\/launch-your-business">Launch your biz<\/a><\/div>/)
    expect(svc).toMatch(/class="svs-btn svs-btn--secondary[^"]*" href="https:\/\/danieltyack.com"|href="https:\/\/danieltyack.com"[^>]*class="svs-btn svs-btn--secondary/)
    const tmp = renderToStaticMarkup(<TempleKitSpotlightLayout layout="temple-kit:stack" content={overlaySpaceOnKit(templeKitSpotlightContent('general', { sample: false }), facts)} />)
    expect(tmp).toContain('>Instagram</a></div>')
    expect(tmp).not.toMatch(/class="tks-door" href="https:\/\/instagram.com\/dan"|href="https:\/\/instagram.com\/dan"[^>]*class="tks-door"/)
    const house = renderToStaticMarkup(<HouseKitSpotlightLayout layout="bold-kit:stack" content={overlaySpaceOnKit(houseKitSpotlightContent('bold', { sample: false }), facts)} />)
    expect(house).toMatch(/hks-btn hks-btn--ghost[^>]*>My site|href="https:\/\/danieltyack.com"[^>]*class="hks-btn hks-btn--ghost"/)
  })
})

describe('CyberWitch and Mindless', () => {
  it('draw each link in its style and keep their own sticker button until a link is marked main', () => {
    for (const [build, Layout, layout] of [
      [cyberwitchSpacePage, CyberWitchKitSpotlightLayout, 'cyberwitch-kit:stack'],
      [mindlessSpacePage, MindlessKitSpotlightLayout, 'mindless-kit:stack'],
    ] as const) {
      const theme = layout.startsWith('cyber') ? 'cyberwitch' : 'mindless'
      const c = build(space(theme), null, { links: { items: LINKS } })!
      expect(c.cta.href).toBe('/spaces/dan/book')
      expect(c.doors.map((d) => d.style)).toEqual(['text', undefined, 'button', 'text'])
      const Draw = Layout as unknown as (p: { layout: string; content: unknown }) => React.ReactNode
      const html = renderToStaticMarkup(<Draw layout={layout} content={c} />)
      expect(html).toContain('>Launch your biz</a></div>')
      const marked = build(space(theme), null, { links: { items: [{ label: 'A', url: 'https://a.example' }, { label: 'B', url: 'https://b.example', style: 'main' }] } })!
      expect(marked.cta).toEqual({ label: 'B', href: 'https://b.example' })
      expect(marked.doors.map((d) => d.title)).toEqual(['A'])
    }
  })
})
