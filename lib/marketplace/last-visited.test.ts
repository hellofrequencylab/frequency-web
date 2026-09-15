import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMERCE_LAST_COOKIE,
  COMMERCE_LAST_MAX_AGE,
  COMMERCE_SURFACES,
  commerceSurfaceHref,
  parseCommerceSurface,
  type CommerceSurface,
} from '@/lib/marketplace/last-visited'

// LIVE-243. The Marketplace umbrella has two halves that have to agree and, until this file,
// nothing measured them in the same place — which is exactly how they drifted. The AREA NAV
// (MarketplaceFacets, components/marketplace/facet-nav.tsx) has offered five areas since
// ADR-596; the LAST-VISITED COOKIE remembered two of them, ['classifieds','market'], and its
// writer was mounted in only those two layouts. A member last browsing Housing or Events had
// their cookie narrowed back to 'classifieds' by parseCommerceSurface, so /marketplace returned
// them to a surface they had not been on. Neither half was wrong on its own terms; the pair was.
//
// Three things are pinned here, and the third is the one that would have caught the defect.
// (1) The DECISION is pure, so every case is driven for real rather than asserted about.
// (2) The nav's href for an area the cookie remembers is the SAME href the cookie returns to.
// (3) Every remembered surface actually WRITES the cookie, from the layout that owns its route.
//
// (2) and (3) are source shapes: MarketplaceFacets is an async server component that reads two
// React-cached Supabase helpers, and CommerceLastVisited is a client component whose whole job
// is a document.cookie write on mount — neither renders in this environment. What makes that
// acceptable is the same thing that makes it acceptable in facet-nav.test.tsx: each guard names
// the exact symbol and token that must be present, rather than grepping for the row's own words.

const NAV = readFileSync(join(process.cwd(), 'components/marketplace/facet-nav.tsx'), 'utf8')
const HUB = readFileSync(join(process.cwd(), 'app/(main)/marketplace/page.tsx'), 'utf8')

/** Every `href: '...'` MarketplaceFacets declares in its AREAS table. */
function navHrefs(): string[] {
  return [...NAV.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
}

/** The layout that owns a surface's route subtree, derived from the href the cookie returns to
 *  (so a query facet like Events' `?price=paid` does not have to be repeated here). */
function layoutFor(surface: CommerceSurface): string {
  const path = commerceSurfaceHref(surface).split('?')[0]
  return join(process.cwd(), `app/(main)${path}/layout.tsx`)
}

describe('the cookie vocabulary', () => {
  it('round-trips every surface it claims to remember', () => {
    for (const s of COMMERCE_SURFACES) expect(parseCommerceSurface(s)).toBe(s)
  })

  it('narrows anything it does not know to Classifieds, the default door', () => {
    for (const v of [undefined, null, '', 'store', 'feed', 'CLASSIFIEDS', '../../etc']) {
      expect(parseCommerceSurface(v)).toBe('classifieds')
    }
  })

  it('remembers all four umbrella areas', () => {
    // The defect: this list was ['classifieds','market'] while the nav offered four.
    expect([...COMMERCE_SURFACES]).toEqual(['classifieds', 'housing', 'market', 'events'])
  })

  it('gives every surface a route to land on', () => {
    for (const s of COMMERCE_SURFACES) {
      expect(commerceSurfaceHref(s)).toMatch(/^\//)
    }
  })

  it('returns to the COMMERCE face of Events, not the full member index', () => {
    // Events is also a member noun with its own rail row, so the umbrella's door has to be the
    // paid and ticketed view or it is a second Events index.
    expect(commerceSurfaceHref('events')).toBe('/events?price=paid')
  })

  it('names the cookie once and keeps it a year', () => {
    expect(COMMERCE_LAST_COOKIE).toBe('commerce_last')
    expect(COMMERCE_LAST_MAX_AGE).toBe(60 * 60 * 24 * 365)
  })
})

describe('the area nav and the cookie point at the same places', () => {
  it('MarketplaceFacets links every remembered surface at exactly the href it returns to', () => {
    // The drift guard. A nav entry that moves (Events gaining ?price=paid) without the cookie
    // moving with it puts a member back somewhere the tab no longer goes.
    const hrefs = navHrefs()
    for (const s of COMMERCE_SURFACES) {
      expect(hrefs).toContain(commerceSurfaceHref(s))
    }
  })

  it('leaves the Frequency Store declared in the nav and OUT of the cookie, on purpose', () => {
    // Its publication is an open ruling (LIVE-245) and its flag has no production reader, so the
    // umbrella must not learn to return a member to a door that may be shut. The two lists are
    // deliberately different lengths; this asserts the difference is the one we meant.
    expect(navHrefs()).toContain('/store')
    expect([...COMMERCE_SURFACES]).not.toContain('store')
  })

  it('the /marketplace door narrows through this module rather than a second whitelist', () => {
    expect(HUB).toContain('parseCommerceSurface')
    expect(HUB).toContain('commerceSurfaceHref')
    expect(HUB).not.toMatch(/redirect\('\//)
  })
})

describe('every remembered surface writes the cookie', () => {
  it.each([...COMMERCE_SURFACES])('%s mounts CommerceLastVisited in its layout', (surface) => {
    // Housing and Events had no layout at all, so two of the four areas could be browsed for a
    // year without the umbrella ever learning where the member was.
    const path = layoutFor(surface)
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('CommerceLastVisited')
    expect(src).toContain(`surface="${surface}"`)
  })

  it('and nothing else does', () => {
    // The positive control for the guard above: it measures a real mount, not the mere presence
    // of a layout file. /store is a commerce route with no layout, and must stay that way while
    // the cookie does not remember it.
    expect(existsSync(join(process.cwd(), 'app/(main)/store/layout.tsx'))).toBe(false)
  })
})
