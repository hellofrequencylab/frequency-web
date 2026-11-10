import { afterEach, describe, expect, it, vi } from 'vitest'
import { NETWORK_KIT_CSS } from './network-kit-css'
import { SITE_LOOK_CSS } from './site-look-css'
import { skinCss } from './site-chrome'
import { SITE_SKIN_NAMES, siteSkinCss } from './site-skin-css'
import { siteThemeStylesheet, themeStylesheetName } from './site-theme-stylesheet'

afterEach(() => vi.unstubAllEnvs())

describe('versioned website CSS pilot', () => {
  it('uses the inline fallback by default and in Vercel production', () => {
    expect(siteThemeStylesheet('network-kit', {})).toBeUndefined()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('SITE_THEME_STYLESHEET_PILOT', '1')
    expect(siteThemeStylesheet('network-kit', {})).toBeUndefined()
  })

  it('uses the hash of exactly the inline bytes, with Network Kit cascade order intact', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('SITE_THEME_STYLESHEET_PILOT', '1')
    const css = siteSkinCss('network-kit', { corners: 'square' })
    expect(css.endsWith(SITE_LOOK_CSS + NETWORK_KIT_CSS)).toBe(true)
    const href = siteThemeStylesheet('network-kit', { corners: 'soft' })
    expect(href).toBe('/_site-theme-assets/' + themeStylesheetName(css))
    expect(href).not.toBe(siteThemeStylesheet('network-kit', {}))
  })

  it('composes the same bytes as the inline sheet for every skin and look', () => {
    for (const theme of SITE_SKIN_NAMES) {
      const skin = { theme, season: 'spring' } as Parameters<typeof skinCss>[0]
      expect(siteSkinCss(theme, {})).toBe(skinCss(skin))
      const look: Parameters<typeof siteSkinCss>[1] = { corners: 'square' }
      const inline = theme === 'network-kit' ? skinCss(skin, SITE_LOOK_CSS) : skinCss(skin) + SITE_LOOK_CSS
      expect(siteSkinCss(theme, look)).toBe(inline)
    }
    expect(siteSkinCss(undefined, {})).toBe(skinCss(null))
  })
})
