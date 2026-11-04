import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { SERVICES_KIT_LAYOUTS, ServicesKitSpotlightLayout, type ServicesKitLayoutId } from './services-kit-layouts'
import { SERVICES_ACCENT_CSS, SERVICES_KIT_LAYOUTS_CSS } from './services-kit-layouts-css'
import { SERVICES_SPOTLIGHT_KIT_IDS, servicesKitSpotlightContent } from '@/lib/spotlight/services-kit-content'

const KEYS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('Services Kit Spotlight layouts', () => {
  it('lists the six layouts of the design in order, with its words', () => {
    expect(SERVICES_KIT_LAYOUTS.map((l) => l.id)).toEqual(KEYS.map((k) => `services-kit:${k}`))
    expect(SERVICES_KIT_LAYOUTS.map((l) => l.blurb)).toContain('Every way in, stacked')
  })

  it('renders every layout for every kit with the token root, no raw colour and no dead link', () => {
    for (const kit of SERVICES_SPOTLIGHT_KIT_IDS) {
      const c = servicesKitSpotlightContent(kit)
      expect(c.layouts).toContain('stack')
      expect(c.layouts).toContain('profile')
      for (const key of c.layouts) {
        const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout={`services-kit:${key}` as ServicesKitLayoutId} content={c} />)
        const body = strip(html)
        expect(html, `${kit} ${key}`).toContain('data-house-theme="services"')
        expect(html).toContain(`data-layout="services-kit:${key}"`)
        expect(body, `${kit} ${key}`).not.toMatch(RAW_COLOR)
        expect(body).not.toContain('href="#"')
        expect(body).not.toContain('—')
        expect(body).toContain(c.name.replaceAll('&', '&amp;'))
      }
    }
  })

  it('keeps the stylesheet and the components free of literal colour (the accent presets are the only hex)', () => {
    expect(SERVICES_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(SERVICES_ACCENT_CSS).toContain('data-accent="tide"')
    for (const f of ['services-kit-layouts.tsx', 'services-kit-layouts-css.ts', '../../lib/spotlight/services-kit-content.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/SERVICES_ACCENTS/g, '')
      expect(src, f).not.toMatch(RAW_COLOR)
    }
  })

  it('builds the doors the way record.js does: services first, then one per function the kit turns on', () => {
    expect(SERVICES_SPOTLIGHT_KIT_IDS).toHaveLength(16)
    const general = servicesKitSpotlightContent('general')
    expect(general.doors.map((d) => d.title).slice(0, 3)).toEqual(['Consultation', 'Signature service', 'Ongoing care'])
    expect(general.doors.map((d) => d.id)).toEqual(expect.arrayContaining(['reviews', 'posts', 'events', 'shop', 'plans', 'letter', 'gallery', 'team', 'locations', 'forms']))
    expect(general.doors.find((d) => d.id === 'events')!.title).toBe('Coming up')
    expect(general.doors.find((d) => d.id === 'team')!.title).toBe('Meet Alex')
    // Trades turns on booking and publishing only, and carries no events, shop or plans.
    const trades = servicesKitSpotlightContent('trades').doors.map((d) => d.id)
    expect(trades).not.toContain('events')
    expect(trades).not.toContain('shop')
    expect(trades).not.toContain('plans')
    expect(general.headings.openings).toEqual({ title: 'Next open', em: 'times.' })
  })

  it('wears the kit hue, and lets the owner choose any of the six accents', () => {
    expect(servicesKitSpotlightContent('general').accent).toBe('tide')
    expect(servicesKitSpotlightContent('trades').accent).toBe('ember')
    expect(servicesKitSpotlightContent('cleaning').accent).toBe('fern')
    expect(servicesKitSpotlightContent('general', { accent: 'bloom' }).accent).toBe('bloom')
    expect(servicesKitSpotlightContent('general', { accent: 'green' }).accent).toBe('tide')
    const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:stack" content={servicesKitSpotlightContent('general', { accent: 'tide' })} register="day" />)
    expect(html).toContain('data-accent="tide"')
    expect(html).toContain('data-th="day"')
  })

  it('ships no invented price, time, review or quote on a live page', () => {
    const live = servicesKitSpotlightContent('general', { sample: false })
    expect(live.offers).toEqual([])
    expect(live.openings).toEqual([])
    expect(live.review).toBeNull()
    expect(live.quote).toBeNull()
    expect(live.proof).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.doors.some((d) => d.id.startsWith('offer-'))).toBe(false)
    expect(live.layouts).toContain('calendar-first')
    for (const key of live.layouts) {
      const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout={`services-kit:${key}` as ServicesKitLayoutId} content={live} />)
      expect(html).not.toMatch(/\$\d|spots left|from \d+ reviews|Priya S\./)
    }
  })

  it('uses the owner name and photo when given', () => {
    const c = servicesKitSpotlightContent('general', { name: 'Harbor Plumbing', photo: '/p.jpg' })
    const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:story" content={c} />)
    expect(html).toContain('Harbor Plumbing')
    expect(html).toContain('p.jpg')
  })
})
