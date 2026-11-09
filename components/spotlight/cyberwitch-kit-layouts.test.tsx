import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { CYBERWITCH_KIT_LAYOUTS, CyberWitchKitSpotlightLayout, type CyberWitchKitLayoutId } from './cyberwitch-kit-layouts'
import { CYBERWITCH_KIT_LAYOUTS_CSS } from './cyberwitch-kit-layouts-css'
import { CYBERWITCH_ACCENT_CSS } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_SPOTLIGHT_KIT_IDS, cyberwitchKitSpotlightContent } from '@/lib/spotlight/cyberwitch-kit-content'

const KEYS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('CyberWitch Kit Spotlight layouts', () => {
  it('lists the six layouts of the design in order, with its words', () => {
    expect(CYBERWITCH_KIT_LAYOUTS.map((l) => l.id)).toEqual(KEYS.map((k) => `cyberwitch-kit:${k}`))
    expect(CYBERWITCH_KIT_LAYOUTS.map((l) => l.blurb)).toContain('Every way in, stacked')
  })

  it('renders every layout for every kit with the token root, no raw colour and no dead link', () => {
    for (const kit of CYBERWITCH_SPOTLIGHT_KIT_IDS) {
      const c = cyberwitchKitSpotlightContent(kit)
      expect(c.layouts).toContain('stack')
      expect(c.layouts).toContain('profile')
      for (const key of c.layouts) {
        const html = renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout={`cyberwitch-kit:${key}` as CyberWitchKitLayoutId} content={c} />)
        const body = strip(html)
        expect(html, `${kit} ${key}`).toContain('data-house-theme="cyberwitch"')
        expect(html).toContain(`data-layout="cyberwitch-kit:${key}"`)
        expect(body, `${kit} ${key}`).not.toMatch(RAW_COLOR)
        expect(body).not.toContain('href="#"')
        expect(body).not.toContain('—')
        expect(body).toContain(c.name.replaceAll('&', '&amp;'))
      }
    }
  })

  it('keeps the stylesheet and the components free of literal colour (the accent presets are the only hex)', () => {
    expect(CYBERWITCH_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(CYBERWITCH_ACCENT_CSS).toContain('data-accent="ice"')
    for (const f of ['cyberwitch-kit-layouts.tsx', 'cyberwitch-kit-layouts-css.ts', '../../lib/spotlight/cyberwitch-kit-content.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src, f).not.toMatch(RAW_COLOR)
    }
  })

  it('builds the doors: one per offer first, then one per function the kit turns on', () => {
    const general = cyberwitchKitSpotlightContent('general')
    expect(general.doors.map((d) => d.title).slice(0, 3)).toEqual(['Your entry offer', 'Your core offer', 'Your deep offer'])
    expect(general.doors.map((d) => d.id)).toEqual(expect.arrayContaining(['reviews', 'posts', 'events', 'letter', 'team', 'locations', 'forms']))
    expect(general.doors.find((d) => d.id === 'events')!.title).toBe("What's happening")
    expect(cyberwitchKitSpotlightContent('band').secondaryCta).toBe('Listen')
    expect(cyberwitchKitSpotlightContent('band').doors.map((d) => d.id)).toContain('shop')
    expect(cyberwitchKitSpotlightContent('general').headings.openings).toEqual({ title: 'Open', em: 'this week.' })
  })

  it('wears the kit accent, falls back to Hex, and lets the owner choose', () => {
    expect(cyberwitchKitSpotlightContent('band').accent).toBe('blood')
    expect(cyberwitchKitSpotlightContent('general').accent).toBe('hex')
    expect(cyberwitchKitSpotlightContent('general', { accent: 'ice' }).accent).toBe('ice')
    expect(cyberwitchKitSpotlightContent('general', { accent: 'green' }).accent).toBe('hex')
    const html = renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout="cyberwitch-kit:stack" content={cyberwitchKitSpotlightContent('general', { accent: 'ice' })} />)
    expect(html).toContain('data-accent="ice"')
    expect(html).not.toContain('data-th=')
  })

  it('ships no invented price, time, review or quote on a live page', () => {
    const live = cyberwitchKitSpotlightContent('general', { sample: false })
    expect(live.offers).toEqual([])
    expect(live.openings).toEqual([])
    expect(live.review).toBeNull()
    expect(live.quote).toBeNull()
    expect(live.proof).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.doors.some((d) => d.id.startsWith('offer-'))).toBe(false)
    expect(live.layouts).toContain('calendar-first')
    for (const key of live.layouts) {
      const html = renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout={`cyberwitch-kit:${key}` as CyberWitchKitLayoutId} content={live} />)
      expect(html).not.toMatch(/\$\d|spots left|Member one/)
    }
  })

  it('uses the owner name and photo when given', () => {
    const c = cyberwitchKitSpotlightContent('general', { name: 'Harbor Plumbing', photo: '/p.jpg' })
    const html = renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout="cyberwitch-kit:story" content={c} />)
    expect(html).toContain('Harbor Plumbing')
    expect(html).toContain('p.jpg')
  })

  it('wears the owner\'s accent: one of the five as its preset, any other colour as its own neon', () => {
    const preset = cyberwitchKitSpotlightContent('general', { accent: '#B4FF1A' })
    expect(preset.accent).toBe('absinthe')
    expect(preset.accentHex).toBeNull()
    expect(renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout="cyberwitch-kit:stack" content={preset} />)).toContain('data-accent="absinthe"')
    const own = cyberwitchKitSpotlightContent('general', { accent: '#3366FF' })
    expect(own.accentHex).toBe('#3366ff')
    expect(renderToStaticMarkup(<CyberWitchKitSpotlightLayout layout="cyberwitch-kit:stack" content={own} />)).toContain('--cw-flare-500:#3366ff')
    expect(cyberwitchKitSpotlightContent('general', { accent: 'ice' }).accent).toBe('ice')
    expect(cyberwitchKitSpotlightContent('general', { accent: 'nonsense' }).accentHex).toBeNull()
  })
})
