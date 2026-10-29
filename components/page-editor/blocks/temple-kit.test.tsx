import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeKitComponents, TEMPLE_KIT_CATEGORY_COMPONENTS } from './temple-kit'
import { templeKitHomeBlocks, templeKitPhoto, TEMPLE_KIT_IMG_MAP } from '@/lib/sites/temple-kit-home'
import { websiteTemplateSections } from '@/lib/sites/editor/templates'
import { planMensworkPage } from '@/lib/sites/menswork-page'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { editorBlockMeta } from '@/lib/sites/editor/block-meta'
import { TEMPLE_KIT_CSS } from '@/components/sites/temple-kit-css'

const links = { origin: 'https://frequency.example', slug: 'temple', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }
const row = (id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, title, startsAt, endsAt: startsAt.replace(/T\d\d/, 'T20'), ...extra })

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown>) {
  const el = (templeKitComponents[type].render as (p: Record<string, unknown>) => React.ReactNode)({ ...templeKitComponents[type].defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

const FIRST_HALF = ['TempleKitHero', 'TempleKitLive', 'TempleKitGatherings', 'TempleKitRooms', 'TempleKitOfferings', 'TempleKitSteps']
const SECOND_HALF = ['TempleKitGallery', 'TempleKitJourneys', 'TempleKitProof', 'TempleKitMembership', 'TempleKitFaq', 'TempleKitLetter', 'TempleKitCta']
const ALL = [...FIRST_HALF, ...SECOND_HALF]

describe('the Temple Kit block family, the Home', () => {
  it('registers the thirteen blocks, beside the untouched Temple family', () => {
    expect(TEMPLE_KIT_CATEGORY_COMPONENTS).toEqual(ALL)
    for (const type of ALL) expect((config.components as Record<string, { label?: string }>)[type]?.label, type).toBeTruthy()
    expect((config.components as Record<string, unknown>).TempleHero).toBeTruthy()
  })

  it('is on the website palette only, in the Sections group', () => {
    expect(categoryKeysForSurface('website')).toContain('templeKit')
    expect(categoryKeysForSurface('space')).not.toContain('templeKit')
    for (const type of ALL) expect(editorBlockMeta(config, type).group, type).toMatch(/^(Sections|Live)$/)
  })

  it('draws every block on its own words, with no raw colour, and keeps the sheet free of one too', () => {
    for (const type of ALL) {
      const html = draw(type, {}, { space: { events: [], series: [] }, links })
      expect(html, type).toContain('data-tk=')
      expect(html, type).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
    const sheet = TEMPLE_KIT_CSS.slice(TEMPLE_KIT_CSS.indexOf('.mw-page{counter-reset:tk-index}'))
    expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })

  it('is planned as own renders with the hero first, and opens the TempleKit Program template', () => {
    const plan = planMensworkPage(templeKitHomeBlocks())
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
    expect(plan.map((p) => ('hero' in p ? p.hero : false))[0]).toBe(true)
    expect(websiteTemplateSections('TempleKit', 'Program').map((b) => b.type)).toEqual(templeKitHomeBlocks().map((b) => b.type))
    expect(websiteTemplateSections('Temple', 'Program').map((b) => b.type)).not.toContain('TempleKitHero')
  })

  it('maps the design image names to the house photographs', () => {
    expect(templeKitPhoto('pool-temple')).toBe('/sites/temple-kit/photos/photo-02.jpg')
    expect(templeKitPhoto('photo-05')).toBe('/sites/temple-kit/photos/photo-05.jpg')
    expect(Object.keys(TEMPLE_KIT_IMG_MAP)).toHaveLength(14)
  })

  it('draws the hero card, band and rows from the Space own events, and links through the site map', () => {
    const events = [row('new-moon', 'New moon circle', '2099-11-18T09:30:00.000Z', { priceLabel: '$60', location: 'The great room' })]
    const metadata = { space: { events, series: [], highlights: [{ label: 'Members', value: 212 }] }, links }
    expect(draw('TempleKitHero', {}, metadata)).toContain('New moon circle')
    expect(draw('TempleKitHero', {}, metadata)).toContain('href="https://frequency.example/events/new-moon"')
    expect(draw('TempleKitLive', { items: [{ source: 'members', icon: 'circle', label: 'Members', value: 'x' }] }, metadata)).toContain('212 members')
    const g = draw('TempleKitGatherings', {}, metadata)
    expect(g).toContain('New moon circle')
    expect(g).toContain('$60')
  })

  it('falls back to the written rows when the Space has none, and drops a cancelled event', () => {
    const empty = { space: { events: [], series: [] }, links }
    expect(draw('TempleKitGatherings', {}, empty)).toContain('New moon sound bath')
    expect(draw('TempleKitGatherings', {}, empty)).toContain('3 left')
    const cancelled = { space: { events: [row('x', 'Cancelled circle', '2099-11-18T09:30:00.000Z', { isCancelled: true })], series: [] }, links }
    expect(draw('TempleKitGatherings', {}, cancelled)).not.toContain('Cancelled circle')
  })

  it('numbers the heads with the one counter, and the copy has no em dash, weekly promise or outcome promise', () => {
    expect(draw('TempleKitRooms', {}, { links })).toContain('tk-index')
    const words = JSON.stringify(templeKitHomeBlocks())
    expect(words).not.toMatch(/—/)
    expect(words).not.toMatch(/Thu 10am|you will sit|You leave slower/)
  })

  it('draws the second half: the night proof, the featured tier, an open first question and the letter form', () => {
    const md = { links }
    expect(draw('TempleKitJourneys', {}, md)).toContain('Four weeks of breath')
    expect(draw('TempleKitProof', {}, md)).toContain('tk-proof')
    const m = draw('TempleKitMembership', {}, md)
    expect(m).toContain('tk-tier--featured')
    expect((m.match(/tk-tier--featured/g) ?? []).length).toBe(1)
    const f = draw('TempleKitFaq', {}, md)
    expect((f.match(/<details/g) ?? []).length).toBe(6)
    expect(f).toContain('open=""')
    expect(draw('TempleKitLetter', {}, md)).toContain('Keep me posted')
    expect(draw('TempleKitCta', {}, md)).toContain('Come and see it.')
    expect(JSON.stringify(templeKitHomeBlocks())).not.toMatch(/every week|weekly|Most chosen/)
  })
})
