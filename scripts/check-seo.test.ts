import { describe, it, expect } from 'vitest'
import {
  run,
  routeForFile,
  sitemapLiteralRoutes,
  INTENTIONALLY_EXCLUDED,
  stripComments,
  parsePathList,
  isPrivateRoute,
  robotsDirective,
  layoutChain,
  doubleBrandedTitles,
  siteName,
} from './check-seo.mjs'

// Locks the SEO/sitemap coherence gate. Scans A and B (coverage + resolution) reason about
// app/(marketing) only, which quietly assumed every indexable page lives there. Scan C, added
// 2026-08-05, covers the rest: /market, /housing and /classifieds are crawlable routes under
// app/(main) that this gate had never once looked at.
//
// The tests below are split the same way the gate's failures are: does it read the source of
// truth correctly (robots.ts / proxy.ts / a page's own metadata), and does it then reach the right
// verdict on the real tree.

describe('check-seo — reading the sources of truth', () => {
  it('blanks comments, so prose about a path is never read as a rule', () => {
    // app/robots.ts's own comment quotes "/spaces" while arguing AGAINST a blanket /spaces rule.
    // A parser that reads comments adopts the rule the comment exists to reject.
    const src = 'const DISALLOW = [\n  // a blanket "/spaces" rule would deindex the profiles\n  "/admin",\n]'
    expect(stripComments(src)).not.toContain('/spaces')
    expect(stripComments(src)).toContain('/admin')
  })

  it('parses DISALLOW out of the real app/robots.ts and PROTECTED_PATHS out of the real proxy.ts', () => {
    const disallow = parsePathList('app/robots.ts', 'DISALLOW')
    const protectedPaths = parsePathList('proxy.ts', 'PROTECTED_PATHS')
    expect(disallow).toContain('/admin')
    expect(protectedPaths).toContain('/settings')
    // The marketplace indexes are DELIBERATELY absent from both — that is exactly why they need a
    // per-page declaration, and why Scan C had to exist for anything to check that they have one.
    for (const r of ['/market', '/housing', '/classifieds']) {
      expect(disallow, `${r} must stay crawlable so detail pages are reachable`).not.toContain(r)
    }
  })

  it('throws rather than silently returning [] when it cannot find its input', () => {
    // A silent [] reads as "nothing is private", which floods the gate with false gaps until
    // someone deletes the scan. Failing loudly is the only safe direction for a parser like this.
    expect(() => parsePathList('app/robots.ts', 'NO_SUCH_LIST')).toThrow(/could not find/)
  })

  it('treats a trailing-slash prefix as subtree-only', () => {
    expect(isPrivateRoute('/admin/crm', ['/admin'])).toBe(true)
    expect(isPrivateRoute('/admin', ['/admin'])).toBe(true)
    expect(isPrivateRoute('/administration', ['/admin'])).toBe(false)
    expect(isPrivateRoute('/join/abc', ['/join/'])).toBe(true)
    expect(isPrivateRoute('/join', ['/join/'])).toBe(false)
  })

  it('reads a page’s robots directive, including from a generateMetadata spread', () => {
    expect(robotsDirective('export const metadata = { robots: { index: false, follow: true } }')).toEqual({ index: false, follow: true })
    expect(robotsDirective('return { ...meta, robots: { index: false, follow: true } }')).toEqual({ index: false, follow: true })
    expect(robotsDirective('export const metadata = { robots: { index: true, follow: true } }')).toEqual({ index: true, follow: true })
    expect(robotsDirective('export const metadata = { title: "x" }')).toBeNull()
    // A comment ABOUT noindex is not a declaration.
    expect(robotsDirective('// robots: { index: false } would be wrong here\nexport const metadata = {}')).toBeNull()
  })

  it('walks a page’s layout chain top-down, so an inherited noindex counts', () => {
    const exists = (p: string) => ['app/layout.tsx', 'app/(main)/pages/layout.tsx'].includes(p)
    expect(layoutChain('app/(main)/pages/home/page.tsx', exists)).toEqual(['app/layout.tsx', 'app/(main)/pages/layout.tsx'])
  })
})

describe('check-seo — routes and the sitemap', () => {
  it('drops route-group segments when mapping a file to its URL', () => {
    expect(routeForFile('app/(marketing)/pricing/page.tsx')).toBe('/pricing')
    expect(routeForFile('app/(main)/market/page.tsx')).toBe('/market')
    expect(routeForFile('app/page.tsx')).toBe('/')
  })

  it('extracts only the LITERAL sitemap entries, never the interpolated ones', () => {
    const routes = sitemapLiteralRoutes()
    expect(routes.size).toBeGreaterThan(10)
    for (const r of routes) expect(r, 'an interpolated path is registry-driven, not hand-written').not.toContain('$')
  })

  it('keeps the allowlist honest — every excluded route carries a real reason', () => {
    for (const [route, reason] of INTENTIONALLY_EXCLUDED) {
      expect(route.startsWith('/'), `${route} must be a path`).toBe(true)
      expect(reason.length, `${route}: an exclusion needs a verified reason`).toBeGreaterThan(20)
    }
  })
})

describe('check-seo — the shipped tree', () => {
  const result = run()

  it('is green: no gap, no dead entry, no undeclared route, no contradiction', () => {
    expect(result.failures).toEqual([])
  })

  it('actually looked outside app/(marketing)', () => {
    // The assertion that would have failed for the whole life of the gate before Scan C. Without
    // it, narrowing the scan back to (marketing) would still read green here.
    expect(result.declarationChecked.length).toBeGreaterThan(20)
    expect(result.skippedPrivate).toBeGreaterThan(50)
  })

  it('sees the three marketplace indexes, and sees them as noindex, follow', () => {
    // The specific routes Phase 9 named. Their whole design is "keep crawlers walking THROUGH the
    // index to the indexable /<vertical>/<id> detail pages", which is noindex WITH follow — a
    // nofollow here would strand the detail pages, and a missing declaration would index an empty
    // app shell. This is the assertion that reads that intent back out of the code.
    for (const route of ['/market', '/housing', '/classifieds']) {
      expect(result.noindexed, `${route} must be seen, and seen as noindex+follow`).toContain(`${route} (noindex, follow)`)
    }
  })
})

describe('Scan D — double-branded titles', () => {
  // app/layout.tsx sets `title.template: '%s · Frequency'`, so a page that ALSO writes the brand
  // renders "Name · Frequency · Frequency" in the tab, the SERP, and every share card that falls
  // back to <title>. /spotlight/[handle] shipped that on every published Spotlight, and
  // /journeys/[slug]'s private fallback shipped it too (found by this scan, not by the plan).
  it('flags a top-level title that re-appends the site name', () => {
    expect(doubleBrandedTitles("export const metadata = { title: 'Spotlight · Frequency' }", 'Frequency')).toHaveLength(1)
  })

  it('leaves openGraph.title and twitter.title alone', () => {
    // These get NO template, so they SHOULD carry the brand — 14 marketing pages correctly do.
    // A flat grep would fail every one of them, which is why the scan walks brace depth.
    const src = `export const metadata = {
      title: 'The Quest works how?',
      openGraph: { title: 'The Quest · Frequency' },
      twitter: { card: 'summary_large_image', title: 'The Quest · Frequency' },
    }`
    expect(doubleBrandedTitles(src, 'Frequency')).toHaveLength(0)
  })

  it('resumes checking after a social block closes', () => {
    const src = `export const metadata = {
      openGraph: { title: 'Fine · Frequency' },
      title: 'Bad · Frequency',
    }`
    expect(doubleBrandedTitles(src, 'Frequency')).toHaveLength(1)
  })

  it('accepts a clean title', () => {
    expect(doubleBrandedTitles("export const metadata = { title: 'Pricing' }", 'Frequency')).toHaveLength(0)
  })

  it('flags an interpolated title with a hardcoded brand suffix', () => {
    // This IS the Spotlight bug verbatim: the name is computed, the ` · Frequency` is not.
    expect(doubleBrandedTitles('return { title: `${name} · Frequency` }', 'Frequency')).toHaveLength(1)
  })

  it('says nothing about a title it cannot read', () => {
    // A call expression is not decidable from source, and guessing is worse than staying quiet.
    expect(doubleBrandedTitles('return { title: buildTitle(name) }', 'Frequency')).toHaveLength(0)
  })

  it('ignores a title inside a comment', () => {
    expect(doubleBrandedTitles("// title: 'Old · Frequency'", 'Frequency')).toHaveLength(0)
  })
})

describe('siteName', () => {
  it('reads the brand from its one source instead of hardcoding it', () => {
    expect(siteName('export const SITE_NAME = "Frequency";')).toBe('Frequency')
  })

  it('returns null when the shape is gone, so the caller can fail loudly', () => {
    expect(siteName('export const SOMETHING = "x"')).toBeNull()
  })
})
