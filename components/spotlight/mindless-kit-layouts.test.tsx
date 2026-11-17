import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { MINDLESS_KIT_LAYOUTS, MindlessKitSpotlightLayout, type MindlessKitLayoutId } from './mindless-kit-layouts'
import { MINDLESS_KIT_LAYOUTS_CSS } from './mindless-kit-layouts-css'
import { MINDLESS_ACCENT_CSS } from '@/lib/theme/mindless'
import { MINDLESS_SPOTLIGHT_KIT_IDS, mindlessKitSpotlightContent } from '@/lib/spotlight/mindless-kit-content'

const KEYS = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const strip = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '')

describe('Mindless Kit Spotlight layouts', () => {
  it('lists the six layouts of the design in order, with its words', () => {
    expect(MINDLESS_KIT_LAYOUTS.map((l) => l.id)).toEqual(KEYS.map((k) => `mindless-kit:${k}`))
    expect(MINDLESS_KIT_LAYOUTS.map((l) => l.blurb)).toContain('Every way in, stacked')
  })

  it('renders every layout for every kit with the token root, no raw colour and no dead link', () => {
    for (const kit of MINDLESS_SPOTLIGHT_KIT_IDS) {
      const c = mindlessKitSpotlightContent(kit)
      expect(c.layouts).toContain('stack')
      expect(c.layouts).toContain('profile')
      for (const key of c.layouts) {
        const html = renderToStaticMarkup(<MindlessKitSpotlightLayout layout={`mindless-kit:${key}` as MindlessKitLayoutId} content={c} />)
        const body = strip(html)
        expect(html, `${kit} ${key}`).toContain('data-house-theme="mindless"')
        expect(html).toContain(`data-layout="mindless-kit:${key}"`)
        expect(body, `${kit} ${key}`).not.toMatch(RAW_COLOR)
        expect(body).not.toContain('href="#"')
        expect(body).not.toContain('—')
        expect(body).toContain(c.name.replaceAll('&', '&amp;'))
      }
    }
  })

  it('keeps the stylesheet and the components free of literal colour (the accent presets are the only hex)', () => {
    expect(MINDLESS_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    expect(MINDLESS_ACCENT_CSS).toContain('data-accent="blue"')
    for (const f of ['mindless-kit-layouts.tsx', 'mindless-kit-layouts-css.ts', '../../lib/spotlight/mindless-kit-content.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src, f).not.toMatch(RAW_COLOR)
    }
  })

  it('builds the doors: one per offer first, then one per function the kit turns on', () => {
    const general = mindlessKitSpotlightContent('general')
    expect(general.doors.map((d) => d.title).slice(0, 3)).toEqual(['A circle', 'The program', 'Become a guide'])
    expect(general.doors.map((d) => d.id)).toEqual(expect.arrayContaining(['reviews', 'posts', 'events', 'letter', 'team', 'locations', 'forms']))
    expect(general.doors.find((d) => d.id === 'events')!.title).toBe("What's happening")
    expect(mindlessKitSpotlightContent('program').secondaryCta).toBe('See the weeks')
    expect(mindlessKitSpotlightContent('shop').doors.map((d) => d.id)).toContain('shop')
    expect(mindlessKitSpotlightContent('general').headings.openings).toEqual({ title: 'Open', em: 'this week.' })
  })

  it('wears the kit accent, falls back to Yellow, and lets the owner choose', () => {
    expect(mindlessKitSpotlightContent('circle').accent).toBe('pink')
    expect(mindlessKitSpotlightContent('general').accent).toBe('yellow')
    expect(mindlessKitSpotlightContent('general', { accent: 'blue' }).accent).toBe('blue')
    expect(mindlessKitSpotlightContent('general', { accent: 'green' }).accent).toBe('yellow')
    const html = renderToStaticMarkup(<MindlessKitSpotlightLayout layout="mindless-kit:stack" content={mindlessKitSpotlightContent('general', { accent: 'blue' })} />)
    expect(html).toContain('data-accent="blue"')
    expect(strip(html)).not.toContain('data-th=')
  })

  it('ships no invented price, time, review or quote on a live page', () => {
    const live = mindlessKitSpotlightContent('general', { sample: false })
    expect(live.offers).toEqual([])
    expect(live.openings).toEqual([])
    expect(live.review).toBeNull()
    expect(live.quote).toBeNull()
    expect(live.proof).toBeNull()
    expect(live.letter).toBeNull()
    expect(live.doors.some((d) => d.id.startsWith('offer-'))).toBe(false)
    expect(live.layouts).toContain('calendar-first')
    for (const key of live.layouts) {
      const html = renderToStaticMarkup(<MindlessKitSpotlightLayout layout={`mindless-kit:${key}` as MindlessKitLayoutId} content={live} />)
      expect(html).not.toMatch(/\$\d|spots left|Member one/)
    }
  })

  it('uses the owner name and photo when given', () => {
    const c = mindlessKitSpotlightContent('general', { name: 'Harbor Plumbing', photo: '/p.jpg' })
    const html = renderToStaticMarkup(<MindlessKitSpotlightLayout layout="mindless-kit:story" content={c} />)
    expect(html).toContain('Harbor Plumbing')
    expect(html).toContain('p.jpg')
  })

  it('wears the owner\'s accent: one of the three as its preset, any other colour as its own paint', () => {
    const preset = mindlessKitSpotlightContent('general', { accent: '#E6297D' })
    expect(preset.accent).toBe('pink')
    expect(preset.accentHex).toBeNull()
    expect(renderToStaticMarkup(<MindlessKitSpotlightLayout layout="mindless-kit:stack" content={preset} />)).toContain('data-accent="pink"')
    const own = mindlessKitSpotlightContent('general', { accent: '#3366FF' })
    expect(own.accentHex).toBe('#3366ff')
    expect(renderToStaticMarkup(<MindlessKitSpotlightLayout layout="mindless-kit:stack" content={own} />)).toContain('--ml-accent:#3366ff')
    expect(mindlessKitSpotlightContent('general', { accent: 'blue' }).accent).toBe('blue')
    expect(mindlessKitSpotlightContent('general', { accent: 'nonsense' }).accentHex).toBeNull()
  })
})
