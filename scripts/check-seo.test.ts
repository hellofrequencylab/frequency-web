import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
  overLongDescriptions,
  metadataStrings,
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

  // ── The parity robots.ts claims in its own header ───────────────────────────
  // "Mirror the PROTECTED_PATHS list in proxy.ts." That sentence was load-bearing prose with
  // nothing enforcing it, and the 2026-08-11 fan-out filed the drift as finding 10.16
  // (~30-48 routes behind). MEASURED, it is not: every protected prefix is covered, with exactly
  // one exception the code itself implements. The finding is retired false — see FINALIZE-PLAN §7.
  //
  // Keeping the measurement as a TEST rather than a note is the point. The claim was true when
  // written and could become true again the next time someone adds a prefix to proxy.ts; a comment
  // asserting parity is precisely the thing that had already stopped being checked.
  it('DISALLOW covers every PROTECTED_PATHS prefix, with /events the one deliberate exception', () => {
    const disallow = parsePathList('app/robots.ts', 'DISALLOW')
    const protectedPaths = parsePathList('proxy.ts', 'PROTECTED_PATHS')

    // A trailing-slash rule ("/join/") is subtree-only, so it covers "/join/x" but not "/join".
    const covered = (p: string) =>
      disallow.some((d) =>
        d.endsWith('/') ? p.startsWith(d) : p === d || p.startsWith(`${d}/`),
      )

    const uncovered = protectedPaths.filter((p) => !covered(p))
    expect(
      uncovered,
      'a proxy-protected prefix that robots.txt still invites crawlers into burns crawl budget on a 307',
    ).toEqual(['/events'])
  })

  it('the /events exception is real code, not an oversight that happens to look intentional', () => {
    // The exemption has to exist in proxy.ts for the line above to be safe to allow. If someone
    // deletes `isPublicEventView`, /events starts 307ing crawlers and the exception above becomes
    // the bug it currently is not — so the two are asserted together, never apart.
    const proxySrc = stripComments(readFileSync('proxy.ts', 'utf8'))
    expect(proxySrc).toContain('isPublicEventView')
    expect(proxySrc).toMatch(/!isPublicEventView\s*&&/)
    // And the create flow, which is NOT public, must still be disallowed by name.
    expect(parsePathList('app/robots.ts', 'DISALLOW')).toContain('/events/new')
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

describe('Scan E — over-length meta descriptions', () => {
  // Google renders ~155-160 characters and truncates the rest mid-word, so the part of the
  // sentence that does the persuading is the part that disappears. /the-lab was 45 over: its
  // whole third sentence never reached a searcher.
  it('flags a description past the cap', () => {
    expect(overLongDescriptions(`export const metadata = { description: '${'x'.repeat(200)}' }`)).toHaveLength(1)
  })

  it('accepts one inside the cap', () => {
    expect(overLongDescriptions(`export const metadata = { description: '${'x'.repeat(150)}' }`)).toHaveLength(0)
  })

  it('leaves openGraph and twitter alone', () => {
    // Those are not truncated the way a SERP description is, and several pages here are
    // deliberately longer there.
    const src = `export const metadata = { openGraph: { description: '${'x'.repeat(200)}' } }`
    expect(overLongDescriptions(src)).toHaveLength(0)
  })

  it('leaves JSON-LD builders alone', () => {
    // `articleSchema({ description })` is structured data, not page metadata: nothing truncates it
    // at 160. The first version of this scan failed /the-quest on exactly this shape.
    expect(overLongDescriptions(`articleSchema({ description: '${'x'.repeat(200)}' })`)).toHaveLength(0)
  })

  it('says nothing about an interpolated description', () => {
    // The value is not knowable from source, and guessing is worse than staying quiet.
    expect(overLongDescriptions('const m = { description: `${blurb} and more` }')).toHaveLength(0)
  })
})

describe('metadataStrings', () => {
  it('reads a top-level property', () => {
    expect(metadataStrings("const m = { title: 'A' }", ['title'])).toHaveLength(1)
  })

  it('skips a call-argument object at any depth', () => {
    expect(metadataStrings("const m = { x: articleSchema({ title: 'A' }) }", ['title'])).toHaveLength(0)
  })

  it('resumes after a call-argument object closes', () => {
    const src = "const m = { a: schema({ title: 'skipped' }), title: 'counted' }"
    const hits = metadataStrings(src, ['title'])
    expect(hits).toHaveLength(1)
    expect(hits[0].value).toBe('counted')
  })
})

describe('metadataStrings — the interpolation split', () => {
  // The two scans need OPPOSITE handling of a template literal, and folding them onto one walker
  // without saying so silently disarmed Scan D. This pins the distinction.
  const src = 'const m = { title: `${name} · Frequency` }'

  it('skips an interpolated value by default (length is unmeasurable)', () => {
    expect(metadataStrings(src, ['title'])).toHaveLength(0)
  })

  it('reads it when asked (a hardcoded brand suffix IS measurable)', () => {
    expect(metadataStrings(src, ['title'], { allowInterpolated: true })).toHaveLength(1)
  })
})
