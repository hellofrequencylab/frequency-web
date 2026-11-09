import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { NEW_WORLD_KIT_LAYOUTS, NewWorldKitSpotlightLayout, type NewWorldKitLayoutId } from './new-world-kit-layouts'
import { NEW_WORLD_ACCENT_CSS, NEW_WORLD_KIT_LAYOUTS_CSS } from './new-world-kit-layouts-css'
import { NEW_WORLD_KIT_IDS, newWorldKitSpotlightContent } from '@/lib/spotlight/new-world-kit-content'

const KEYS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('New World Kit Spotlight layouts', () => {
  it('lists the six layouts of the design in order, with its words', () => {
    expect(NEW_WORLD_KIT_LAYOUTS.map((l) => l.id)).toEqual(KEYS.map((k) => `new-world-kit:${k}`))
    expect(NEW_WORLD_KIT_LAYOUTS.map((l) => l.blurb)).toContain('Every way in, stacked')
  })

  it('renders every layout for every kit with the token root, no raw colour and no dead link', () => {
    for (const kit of NEW_WORLD_KIT_IDS) {
      const c = newWorldKitSpotlightContent(kit)
      expect(c.layouts).toContain('stack')
      expect(c.layouts).toContain('profile')
      for (const key of c.layouts) {
        const html = renderToStaticMarkup(<NewWorldKitSpotlightLayout layout={`new-world-kit:${key}` as NewWorldKitLayoutId} content={c} />)
        const body = strip(html)
        expect(html, `${kit} ${key}`).toContain('data-house-theme="new-world"')
        expect(html).toContain(`data-layout="new-world-kit:${key}"`)
        expect(body, `${kit} ${key}`).not.toMatch(RAW_COLOR)
        expect(body).not.toContain('href="#"')
        expect(body).not.toContain('—')
        expect(body).toContain(c.name.replaceAll('&', '&amp;'))
      }
    }
  })

  it('keeps the stylesheet and the components free of literal colour (the accent presets are the only hex)', () => {
    expect(NEW_WORLD_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(NEW_WORLD_ACCENT_CSS).toContain('data-accent="tide"')
    for (const f of ['new-world-kit-layouts.tsx', 'new-world-kit-layouts-css.ts', '../../lib/spotlight/new-world-kit-content.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/NEW_WORLD_ACCENTS/g, '')
      expect(src, f).not.toMatch(RAW_COLOR)
    }
  })

  it('builds the doors the way record.js does: services first, then one per function the kit turns on', () => {
    const general = newWorldKitSpotlightContent('general')
    expect(general.doors.map((d) => d.title).slice(0, 3)).toEqual(['First visit', 'Drop in', 'Membership'])
    expect(general.doors.map((d) => d.id)).toEqual(expect.arrayContaining(['reviews', 'posts', 'events', 'plans', 'circles', 'firstnight', 'letter', 'team', 'locations', 'forms']))
    expect(general.doors.map((d) => d.id)).not.toContain('shop')
    expect(general.doors.find((d) => d.id === 'events')!.title).toBe("What's happening")
    expect(general.doors.find((d) => d.id === 'team')!.title).toBe('Meet Your')
    // Hosts turn on a shop but no plans.
    const hosts = newWorldKitSpotlightContent('hosts').doors.map((d) => d.id)
    expect(hosts).toContain('shop')
    expect(hosts).not.toContain('plans')
    expect(newWorldKitSpotlightContent('coaches').secondaryCta).toBe('This week’s sessions')
    expect(newWorldKitSpotlightContent('studios').headings.services).toEqual({ title: 'Classes and', em: 'passes.' })
    expect(newWorldKitSpotlightContent('general').headings.openings).toEqual({ title: 'Open', em: 'this week.' })
  })

  it('wears the kit hue when the theme has a preset for it and falls back to Tide when it does not, and lets the owner choose', () => {
    expect(newWorldKitSpotlightContent('hosts').accent).toBe('tide')
    expect(newWorldKitSpotlightContent('general').accent).toBe('tide')
    expect(newWorldKitSpotlightContent('general', { accent: 'blue' }).accent).toBe('tide')
    expect(newWorldKitSpotlightContent('general', { accent: 'green' }).accent).toBe('tide')
    const html = renderToStaticMarkup(<NewWorldKitSpotlightLayout layout="new-world-kit:stack" content={newWorldKitSpotlightContent('general', { accent: 'tide' })} register="day" />)
    expect(html).toContain('data-accent="tide"')
    expect(html).toContain('data-th="day"')
  })

  it('ships no invented price, time, review or quote on a live page', () => {
    const live = newWorldKitSpotlightContent('general', { sample: false })
    expect(live.offers).toEqual([])
    expect(live.openings).toEqual([])
    expect(live.review).toBeNull()
    expect(live.quote).toBeNull()
    expect(live.proof).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.doors.some((d) => d.id.startsWith('offer-'))).toBe(false)
    expect(live.layouts).toContain('calendar-first')
    for (const key of live.layouts) {
      const html = renderToStaticMarkup(<NewWorldKitSpotlightLayout layout={`new-world-kit:${key}` as NewWorldKitLayoutId} content={live} />)
      expect(html).not.toMatch(/\$\d|spots left|Member one/)
    }
  })

  it('draws the design\'s default type voice and the rating line, and keeps the name clear of a long hero title', () => {
    expect(NEW_WORLD_KIT_LAYOUTS_CSS).toMatch(/\.nws-d\{[^}]*text-transform:none/)
    expect(NEW_WORLD_KIT_LAYOUTS_CSS).not.toMatch(/\.nws-hero-top\{[^}]*position:absolute/)
    const c = newWorldKitSpotlightContent('general')
    expect(c.rating).toBe('3 sessions a week')
    for (const key of ['stack', 'card-wall', 'profile'] as const) {
      expect(renderToStaticMarkup(<NewWorldKitSpotlightLayout layout={`new-world-kit:${key}`} content={c} />), key).toContain('3 sessions a week')
    }
    expect(newWorldKitSpotlightContent('general', { sample: false }).rating).toBeNull()
  })

  it('uses the owner name and photo when given', () => {
    const c = newWorldKitSpotlightContent('general', { name: 'Harbor Plumbing', photo: '/p.jpg' })
    const html = renderToStaticMarkup(<NewWorldKitSpotlightLayout layout="new-world-kit:story" content={c} />)
    expect(html).toContain('Harbor Plumbing')
    expect(html).toContain('p.jpg')
  })
})
