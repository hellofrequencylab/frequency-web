import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { HOUSE_KIT_LAYOUT_LABELS, HouseKitSpotlightLayout, houseKitVars } from './house-kit-layouts'
import { HOUSE_KIT_LAYOUTS_CSS } from './house-kit-layouts-css'
import { HOUSE_KIT_LAYOUT_KEYS, HOUSE_KIT_PREFIX, houseKitSpotlightContent, type HouseKitTheme } from '@/lib/spotlight/house-kit-content'
import { asSpotlightLayoutId, isHouseKitLayout, spaceLayoutId, spaceLooksFor, spotlightLayoutsFor } from '@/lib/spotlight/layouts'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'

const THEMES: HouseKitTheme[] = ['bold', 'wildheart', 'midnight']
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
// The root's style attribute carries the theme's own token set; everything else must be free of literal colour.
const body = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/ style="[^"]*"/, '')

describe('House kit Spotlight layouts (Bold, Wildheart, Nocturne)', () => {
  it('registers the six layouts for each theme under its own prefix', () => {
    expect(HOUSE_KIT_LAYOUT_LABELS.map((l) => l.key)).toEqual([...HOUSE_KIT_LAYOUT_KEYS])
    for (const t of THEMES) {
      const ids = spotlightLayoutsFor(t).map((l) => l.id)
      expect(ids).toEqual(HOUSE_KIT_LAYOUT_KEYS.map((k) => `${HOUSE_KIT_PREFIX[t]}:${k}`))
      for (const id of ids) expect(isHouseKitLayout(asSpotlightLayoutId(id)!)).toBe(true)
      expect(spaceLooksFor(t)).toHaveLength(6)
      expect(spaceLayoutId(t, 'story')).toBe(`${HOUSE_KIT_PREFIX[t]}:story`)
    }
  })

  it('renders every layout for every theme with its tokens, no raw colour, no dead link and no em dash', () => {
    for (const t of THEMES) {
      const c = houseKitSpotlightContent(t)
      for (const k of HOUSE_KIT_LAYOUT_KEYS) {
        const html = renderToStaticMarkup(<HouseKitSpotlightLayout layout={`${HOUSE_KIT_PREFIX[t]}:${k}`} content={c} />)
        expect(html, `${t} ${k}`).toContain(`data-kit-theme="${t}"`)
        expect(html).toContain(`--hk-canvas:${MEGA_SURFACES[t]!.canvas}`)
        expect(body(html), `${t} ${k}`).not.toMatch(RAW_COLOR)
        expect(html).not.toContain('href="#"')
        expect(html).not.toContain('—')
      }
    }
  })

  it('draws nothing for another theme\'s layout id', () => {
    const c = houseKitSpotlightContent('bold')
    expect(renderToStaticMarkup(<HouseKitSpotlightLayout layout="wildheart-kit:stack" content={c} />)).toBe('')
  })

  it('coaches in the preview and shows none of it on a live page', () => {
    for (const t of THEMES) {
      const sample = houseKitSpotlightContent(t)
      expect(sample.offers.length).toBeGreaterThan(0)
      expect(sample.pain).toMatch(/^(Say|Name)/)
      const live = houseKitSpotlightContent(t, { name: 'Salt House', sample: false })
      expect(live.offers).toEqual([])
      expect(live.openings).toEqual([])
      expect(live.quote).toBeNull()
      expect(live.pain).toBe('')
      expect(live.hero.photo).toBeNull()
      const html = renderToStaticMarkup(<HouseKitSpotlightLayout layout={`${HOUSE_KIT_PREFIX[t]}:profile`} content={live} />)
      expect(html).toContain('Salt House')
      expect(html).not.toMatch(/Your (name|price)|Paste a real line/)
    }
  })

  it('wears an owner accent over the theme\'s, and keeps the theme\'s label colour for its own accent', () => {
    const s = MEGA_SURFACES.bold!
    const own = houseKitVars('bold', s.accent.accent) as Record<string, string>
    expect(own['--hk-accent-text']).toBe(s.accent.text)
    const picked = houseKitVars('bold', '#2a6f97') as Record<string, string>
    expect(picked['--hk-accent']).toBe('#2a6f97')
    expect(picked['--hk-accent-text']).toContain('color-mix')
  })

  it('keeps the stylesheet and the components free of literal colour', () => {
    expect(HOUSE_KIT_LAYOUTS_CSS).not.toMatch(RAW_COLOR)
    for (const f of ['house-kit-layouts.tsx', 'house-kit-layouts-css.ts']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).not.toMatch(RAW_COLOR)
    }
  })
})
