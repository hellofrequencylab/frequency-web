import { describe, expect, it } from 'vitest'
import {
  blockedByRobots,
  canonicalHref,
  jsonLdBlocks,
  metaContent,
  pageTitle,
  robotsDisallows,
  robotsSitemaps,
  sitemapLocs,
} from './public-surface'

const ROBOTS = `User-Agent: *
Allow: /
Disallow: /api/
Disallow: /events/new$

User-Agent: GPTBot
Disallow: /only-gpt

Sitemap: https://frequencylocal.com/sitemap.xml
`

describe('public-surface parsers', () => {
  it('reads only the * group disallows', () => {
    expect(robotsDisallows(ROBOTS)).toEqual(['/api/', '/events/new$'])
  })
  it('reads sitemap lines', () => {
    expect(robotsSitemaps(ROBOTS)).toEqual(['https://frequencylocal.com/sitemap.xml'])
  })
  it('reads sitemap locs and unescapes ampersands', () => {
    expect(sitemapLocs('<urlset><url><loc>https://a.test/x?a=1&amp;b=2</loc></url></urlset>')).toEqual([
      'https://a.test/x?a=1&b=2',
    ])
  })
  it('matches robots rules by prefix and by $ anchor', () => {
    const rules = robotsDisallows(ROBOTS)
    expect(blockedByRobots('/api/status', rules)).toBe('/api/')
    expect(blockedByRobots('/events/new', rules)).toBe('/events/new$')
    expect(blockedByRobots('/events/new/x', rules)).toBeNull()
    expect(blockedByRobots('/pricing', rules)).toBeNull()
  })
  it('reads head tags', () => {
    const html =
      '<title>T</title><link rel="canonical" href="https://a.test/p"/><meta name="robots" content="noindex"/><meta property="og:title" content="O"/>'
    expect(pageTitle(html)).toBe('T')
    expect(canonicalHref(html)).toBe('https://a.test/p')
    expect(metaContent(html, 'name', 'robots')).toBe('noindex')
    expect(metaContent(html, 'property', 'og:title')).toBe('O')
    expect(metaContent(html, 'name', 'description')).toBeNull()
  })
  it('flags JSON-LD that does not parse', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Organization"}</script><script type="application/ld+json">{oops</script>'
    const blocks = jsonLdBlocks(html)
    expect(blocks[0].data).toEqual({ '@type': 'Organization' })
    expect(blocks[1].error).toBeTruthy()
  })
})
