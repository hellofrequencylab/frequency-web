import { describe, expect, it } from 'vitest'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { SITE_HOME_SLUG, siteBaseUrl, sitePageUrl, siteRobotsTxt, siteSitemapXml } from './seo'

describe('site URLs (LIVE-783)', () => {
  it('keeps its home slug equal to the profile pages one', () => {
    expect(SITE_HOME_SLUG).toBe(HOME_SLUG)
  })

  it('uses the bound domain as the origin when there is one', () => {
    expect(siteBaseUrl('danieltyack', 'danieltyack.com', 'https://frequencylocal.com')).toBe('https://danieltyack.com')
  })

  it('falls back to /sites/<slug> on Frequency', () => {
    expect(siteBaseUrl('danieltyack', null, 'https://frequencylocal.com/')).toBe(
      'https://frequencylocal.com/sites/danieltyack',
    )
  })

  it('spells home with the root slash on a domain and without one under /sites', () => {
    expect(sitePageUrl('https://danieltyack.com')).toBe('https://danieltyack.com/')
    expect(sitePageUrl('https://frequencylocal.com/sites/danieltyack', 'home')).toBe(
      'https://frequencylocal.com/sites/danieltyack',
    )
  })

  it('hangs other pages off the base', () => {
    expect(sitePageUrl('https://danieltyack.com', 'about')).toBe('https://danieltyack.com/about')
    expect(sitePageUrl('https://frequencylocal.com/sites/danieltyack', 'about')).toBe(
      'https://frequencylocal.com/sites/danieltyack/about',
    )
  })
})

describe('siteRobotsTxt', () => {
  it('invites crawlers and names the site sitemap once published', () => {
    const txt = siteRobotsTxt('https://danieltyack.com', true)
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Sitemap: https://danieltyack.com/sitemap.xml')
    expect(txt).not.toContain('frequencylocal')
  })

  it('keeps crawlers out of a host with no published site', () => {
    expect(siteRobotsTxt('https://danieltyack.com', false)).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('siteSitemapXml', () => {
  it('lists home first, then each page, on the site origin', () => {
    const xml = siteSitemapXml('https://danieltyack.com', ['home', 'about', 'work'])
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(['https://danieltyack.com/', 'https://danieltyack.com/about', 'https://danieltyack.com/work'])
    expect(xml.startsWith('<?xml')).toBe(true)
  })

  it('escapes XML in a URL', () => {
    expect(siteSitemapXml('https://a.com', ['x&y'])).toContain('https://a.com/x&amp;y')
  })
})
