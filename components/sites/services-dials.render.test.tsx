import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from './site-chrome'
import { readSiteStyle, servicesDials, siteDials } from '@/lib/theme/site-style'
import { themeEditor } from '@/lib/themes/editor-dials'

// SERVICES ON SCHEMA 2 (LIVE-2210): the Type voice, Motion and Images dials reach the site root as data-type, data-motion and
// data-image, the three switches the Services sheet (services-css.ts) is keyed on. Before this, nothing wrote them, so those rules were dead.
const base = { themeFonts: false, brandName: 'Harbor Plumbing', homeHref: '/', links: [], cta: null }

describe('Services dials on the site root', () => {
  it('declares the dials the Services sheet draws, and hides hero and accent', () => {
    const ui = themeEditor('services', 'Services')
    expect(ui.dials.map((d) => d.id)).toEqual(expect.arrayContaining(['register', 'corners', 'spacing', 'header', 'footer', 'type', 'motion', 'image']))
    expect(ui.dials.some((d) => d.id === 'hero' || d.id === 'accent')).toBe(false)
    expect(ui.own).toEqual({ register: 'night', type: 'caps', motion: 'full', image: 'glow' })
    expect(ui.looks.map((l) => l.id)).toEqual(['own', 'studio', 'nightline', 'paper', 'trade'])
  })
  it('writes the theme defaults when the owner chose nothing, and the owner values when they did', () => {
    const own = themeEditor('services').own
    const plain = renderToStaticMarkup(<SiteChrome {...base} skin={{ theme: 'services', season: 'fall', register: 'night', dials: servicesDials(siteDials(readSiteStyle({ siteStyle: { theme: 'services' } }), own)) }}><p>x</p></SiteChrome>)
    expect(plain).toContain('data-type="caps"')
    expect(plain).toContain('data-motion="full"')
    expect(plain).toContain('data-image="glow"')
    const picked = readSiteStyle({ siteStyle: { theme: 'services', dials: { type: 'editorial', motion: 'off', image: 'mono' } } })
    const html = renderToStaticMarkup(<SiteChrome {...base} skin={{ theme: 'services', season: 'fall', register: 'day', dials: servicesDials(siteDials(picked, own)) }}><p>x</p></SiteChrome>)
    expect(html).toContain('data-th="day"')
    expect(html).toContain('data-type="editorial"')
    expect(html).toContain('data-motion="off"')
    expect(html).toContain('data-image="mono"')
  })
  it('leaves every other theme root without the three switches', () => {
    const html = renderToStaticMarkup(<SiteChrome {...base} skin={{ theme: 'midnight', season: 'fall' }}><p>x</p></SiteChrome>)
    expect(html).not.toMatch(/data-(type|motion|image)=/)
  })
})
