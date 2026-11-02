import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { SERVICES_KIT_LAYOUTS, ServicesKitSpotlightLayout, type ServicesKitLayoutId } from './services-kit-layouts'
import { SERVICES_ACCENT_CSS, SERVICES_KIT_LAYOUTS_CSS } from './services-kit-layouts-css'
import { SERVICES_KIT_IDS, servicesKitSpotlightContent } from '@/lib/spotlight/services-kit-content'

const KEYS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('New World (Services theme) Kit Spotlight layouts', () => {
  it('lists the six layouts of the design in order, with its words', () => {
    expect(SERVICES_KIT_LAYOUTS.map((l) => l.id)).toEqual(KEYS.map((k) => `services-kit:${k}`))
    expect(SERVICES_KIT_LAYOUTS.map((l) => l.blurb)).toContain('Every way in, stacked')
  })

  it('renders every layout for every kit with the token root, no raw colour and no dead link', () => {
    for (const kit of SERVICES_KIT_IDS) {
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
    expect(SERVICES_ACCENT_CSS).toContain('data-accent="ember"')
    for (const f of ['services-kit-layouts.tsx', 'services-kit-layouts-css.ts', '../../lib/spotlight/services-kit-content.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/SERVICES_ACCENTS/g, '')
      expect(src, f).not.toMatch(RAW_COLOR)
    }
  })

  it('builds the doors the way record.js does: services first, then one per function the kit turns on', () => {
    const general = servicesKitSpotlightContent('general')
    expect(general.doors.map((d) => d.title).slice(0, 3)).toEqual(['First visit', 'Drop in', 'Membership'])
    expect(general.doors.map((d) => d.id)).toEqual(expect.arrayContaining(['reviews', 'posts', 'events', 'plans', 'circles', 'firstnight', 'letter', 'team', 'locations', 'forms']))
    expect(general.doors.map((d) => d.id)).not.toContain('shop')
    expect(general.doors.find((d) => d.id === 'events')!.title).toBe("What's happening")
    expect(general.doors.find((d) => d.id === 'team')!.title).toBe('Meet Your')
    // Hosts turn on a shop but no plans.
    const hosts = servicesKitSpotlightContent('hosts').doors.map((d) => d.id)
    expect(hosts).toContain('shop')
    expect(hosts).not.toContain('plans')
    expect(servicesKitSpotlightContent('coaches').secondaryCta).toBe('This week’s sessions')
    expect(servicesKitSpotlightContent('studios').headings.services).toEqual({ title: 'Classes and', em: 'passes.' })
    expect(servicesKitSpotlightContent('general').headings.openings).toEqual({ title: 'Open', em: 'this week.' })
  })

  it('wears the kit hue when the theme has a preset for it and falls back to Tide when it does not, and lets the owner choose', () => {
    expect(servicesKitSpotlightContent('hosts').accent).toBe('tide')
    expect(servicesKitSpotlightContent('general').accent).toBe('tide')
    expect(servicesKitSpotlightContent('general', { accent: 'ember' }).accent).toBe('ember')
    expect(servicesKitSpotlightContent('general', { accent: 'green' }).accent).toBe('fern')
    const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:stack" content={servicesKitSpotlightContent('general', { accent: 'ember' })} register="day" />)
    expect(html).toContain('data-accent="ember"')
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
      expect(html).not.toMatch(/\$\d|spots left|Member one/)
    }
  })

  it('uses the owner name and photo when given', () => {
    const c = servicesKitSpotlightContent('general', { name: 'Harbor Plumbing', photo: '/p.jpg' })
    const html = renderToStaticMarkup(<ServicesKitSpotlightLayout layout="services-kit:story" content={c} />)
    expect(html).toContain('Harbor Plumbing')
    expect(html).toContain('p.jpg')
  })
})
