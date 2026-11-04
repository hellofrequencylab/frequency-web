import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from './site-chrome'
import { NEW_WORLD_DIALS_CSS } from './new-world-dials-css'
import { readSiteStyle, siteDials, siteLookOverrides, siteRootDials } from '@/lib/theme/site-style'
import { themeEditor } from '@/lib/themes/editor-dials'

// NEW WORLD ON SCHEMA 2 (LIVE-2175): New World, the theme every Space starts in, shows Type voice, Motion and Images and four Looks,
// and its site root carries data-type, data-motion and data-image with its dial sheet laid after the skin, all fenced to the theme.
const base = { themeFonts: false, brandName: 'Your place', homeHref: '/', links: [], cta: null }
const draw = (siteStyle: Record<string, string>) => {
  const style = readSiteStyle({ siteStyle: { theme: 'new-world', ...siteStyle } })
  const d = siteDials(style, themeEditor('new-world').own)
  return renderToStaticMarkup(<SiteChrome {...base} look={siteLookOverrides(style)} skin={{ theme: 'new-world', season: 'fall', register: d.register === 'day' ? 'day' : 'night', dials: siteRootDials(d) }}><p>x</p></SiteChrome>)
}

describe('New World dials on the site root', () => {
  it('declares the dials its sheets draw, hides hero and accent, and ships the four Looks', () => {
    const ui = themeEditor('new-world', 'New World')
    expect(ui.dials.map((d) => d.id)).toEqual(expect.arrayContaining(['register', 'corners', 'spacing', 'header', 'footer', 'type', 'motion', 'image']))
    expect(ui.dials.some((d) => d.id === 'hero' || d.id === 'accent')).toBe(false)
    expect(ui.own).toEqual({ register: 'night', type: 'caps', motion: 'full', image: 'glow' })
    expect(ui.looks.map((l) => l.id)).toEqual(['own', 'studio', 'nightline', 'paper', 'trade'])
  })
  it('writes the theme defaults when the owner chose nothing, and the owner values when they did', () => {
    const plain = draw({})
    expect(plain).toContain('data-th="night"')
    expect(plain).toContain('data-type="caps"')
    expect(plain).toContain('data-motion="full"')
    expect(plain).toContain('data-image="glow"')
    const paper = draw(themeEditor('new-world').looks.find((l) => l.id === 'paper')!.dials)
    for (const a of ['data-th="day"', 'data-type="editorial"', 'data-motion="off"', 'data-image="mono"', 'data-site-corners="square"', 'data-site-spacing="balanced"']) expect(paper).toContain(a)
  })
  it('lays the dial sheet after the New World skin, and only there', () => {
    expect(draw({})).toContain(NEW_WORLD_DIALS_CSS)
    const other = renderToStaticMarkup(<SiteChrome {...base} skin={{ theme: 'midnight', season: 'fall' }}><p>x</p></SiteChrome>)
    expect(other).not.toContain(NEW_WORLD_DIALS_CSS)
    expect(other).not.toMatch(/data-(type|motion|image)=/)
  })
  it('scopes every rule to the New World site root and never makes anything move more', () => {
    const rules = NEW_WORLD_DIALS_CSS.split('\n').filter((l) => l.includes('{'))
    expect(rules.length).toBeGreaterThan(8)
    for (const r of rules) for (const sel of r.slice(0, r.indexOf('{')).split(',')) expect(sel.trim().startsWith('[data-house-theme="new-world"][data-'), sel).toBe(true)
    expect(NEW_WORLD_DIALS_CSS).not.toMatch(/animation:(?!none)/)
  })
})
