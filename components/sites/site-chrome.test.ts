import { describe, expect, it } from 'vitest'
import { siteHref } from './site-chrome'

describe('siteHref', () => {
  it('sends Home to the site root under /sites', () => {
    expect(siteHref('/sites/danieltyack', 'home')).toBe('/sites/danieltyack')
  })

  it('hangs a custom page off the site root', () => {
    expect(siteHref('/sites/danieltyack', 'about')).toBe('/sites/danieltyack/about')
  })

  it('serves the domain root when the site is on its own domain', () => {
    expect(siteHref('', 'home')).toBe('/')
    expect(siteHref('', 'about')).toBe('/about')
  })
})
