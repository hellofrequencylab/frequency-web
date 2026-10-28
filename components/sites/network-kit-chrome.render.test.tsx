import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from './site-chrome'
import { NETWORK_KIT_CSS } from './network-kit-css'

const base = { themeFonts: false, brandName: 'Harbor Network', homeHref: '/', links: [{ href: '/a', label: 'Meetups' }], cta: null, skin: { theme: 'network-kit' as const, season: 'fall' as const, scheme: 'ocean' as const } }

describe('the Network Theme Kit chrome', () => {
  it('wears the kit: its theme and scheme on the root, its skin after the owner look sheet, no season attribute', () => {
    const html = renderToStaticMarkup(<SiteChrome {...base} look={{ corners: 'square' }}><p>x</p></SiteChrome>)
    expect(html).toContain('data-house-theme="network-kit"')
    expect(html).toContain('data-scheme="ocean"')
    expect(html).not.toContain('data-season')
    expect(html.indexOf('data-site-corners="square"')).toBeGreaterThan(-1)
    expect(html.lastIndexOf('[data-house-theme=&quot;network-kit&quot;]') > html.indexOf('[data-site-corners=&quot;square&quot;]') || html.includes(NETWORK_KIT_CSS.slice(-60))).toBe(true)
    expect(html).toContain('nk-logo')
  })
  it('draws a full footer with the Powered by Frequency line, and a minimal one with the legal row only', () => {
    const full = renderToStaticMarkup(<SiteChrome {...base} showBrandFooter><p>x</p></SiteChrome>)
    expect(full).toContain('data-footer="full"')
    expect(full).toContain('class="hs-footer-top"')
    expect(full).toContain('Powered by Frequency')
    const minimal = renderToStaticMarkup(<SiteChrome {...base} showBrandFooter={false}><p>x</p></SiteChrome>)
    expect(minimal).toContain('data-footer="minimal"')
    expect(minimal).not.toContain('class="hs-footer-top"')
    expect(minimal).toContain('Powered by Frequency')
  })
  it('keeps Frequency off the footer when the Space removed the credit', () => {
    expect(renderToStaticMarkup(<SiteChrome {...base} credit="none"><p>x</p></SiteChrome>)).not.toContain('Powered by Frequency')
  })
  it('folds the announce bar away when there is nothing to announce', () => {
    expect(renderToStaticMarkup(<SiteChrome {...base}><p>x</p></SiteChrome>)).not.toContain('class="nk-bar"')
  })
})
