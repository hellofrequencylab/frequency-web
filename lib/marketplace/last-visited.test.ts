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
} from './last-visited'

// LIVE-243. The area nav has listed Classifieds, Housing, Market and Events since ADR-596, and this
// whitelist knew only classifieds and market. parseCommerceSurface NARROWS an unknown value rather
// than failing, so the two never disagreed out loud: a member whose last commerce surface was
// Housing or Events clicked Marketplace and was silently sent to Classifieds.
//
// Nothing measured the writer and the reader together, which is how they drifted. The load-bearing
// test here is the drift case: it reads the NAV's own hrefs off disk and requires every commerce
// destination to be one the nav actually offers, and every href the nav offers (bar the Frequency
// Store, which LIVE-245 gates on a flag) to be reachable as a surface.

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NAV = R('components/marketplace/facet-nav.tsx')

/** The hrefs the area nav links to, read from its source rather than restated. */
function navHrefs(): string[] {
  const hrefs = [...NAV.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
  if (hrefs.length < 4) throw new Error(`facet-nav.tsx yielded only ${hrefs.length} hrefs; its shape moved`)
  return hrefs
}

describe('the commerce surface vocabulary', () => {
  it('carries all four areas the nav browses, in nav order', () => {
    expect([...COMMERCE_SURFACES]).toEqual(['classifieds', 'housing', 'market', 'events'])
  })

  it('lands Events on the commerce face, not the member index', () => {
    // The tab has to read as the commerce face (paid and ticketed) rather than a second Events
    // index — Events is also one of the four member nouns and carries its own rail row.
    expect(commerceSurfaceHref('events')).toBe('/events?price=paid')
  })

  it('gives every surface a destination', () => {
    for (const s of COMMERCE_SURFACES) expect(commerceSurfaceHref(s)).toMatch(/^\//)
  })

  it('narrows anything it does not recognise to the default door', () => {
    for (const bad of [undefined, null, '', 'shop', 'store', 'feed', 'HOUSING', '../etc'])
      expect(parseCommerceSurface(bad)).toBe('classifieds')
  })

  it('accepts every surface it claims to carry', () => {
    for (const s of COMMERCE_SURFACES) expect(parseCommerceSurface(s)).toBe(s)
  })

  it('keeps the cookie contract stable', () => {
    expect(COMMERCE_LAST_COOKIE).toBe('commerce_last')
    expect(COMMERCE_LAST_MAX_AGE).toBe(60 * 60 * 24 * 365)
  })
})

describe('the drift case: the nav and the cookie cannot disagree', () => {
  it('every commerce destination is an href the area nav offers', () => {
    const offered = navHrefs()
    for (const s of COMMERCE_SURFACES) expect(offered).toContain(commerceSurfaceHref(s))
  })

  it('every area the nav offers is reachable as a surface, bar the flag-gated Store', () => {
    const reachable = COMMERCE_SURFACES.map(commerceSurfaceHref)
    for (const href of navHrefs()) {
      if (href === '/store') continue // LIVE-245: gated on marketplace_shop_published, not a tab
      expect(reachable).toContain(href)
    }
  })
})

describe('every surface has something that writes the cookie', () => {
  // Classifieds, Housing and Market stamp it from a subtree layout: every path under them is a
  // commerce path. Events does NOT, and that asymmetry is deliberate (see the page's comment).
  const LAYOUTS: [CommerceSurface, string][] = [
    ['classifieds', 'app/(main)/classifieds/layout.tsx'],
    ['housing', 'app/(main)/housing/layout.tsx'],
    ['market', 'app/(main)/market/layout.tsx'],
  ]

  for (const [surface, path] of LAYOUTS) {
    it(`${surface} stamps it from ${path}`, () => {
      expect(existsSync(join(process.cwd(), path))).toBe(true)
      const src = R(path)
      expect(src).toContain('CommerceLastVisited')
      expect(src).toContain(`surface="${surface}"`)
    })
  }

  it('events stamps it from the PAGE, and only on the commerce face', () => {
    // A layout here would tell /marketplace "you were last in the Marketplace" for a member who
    // only ever opened Events from their rail, then send them to a paid-only filter.
    expect(existsSync(join(process.cwd(), 'app/(main)/events/layout.tsx'))).toBe(false)
    const page = R('app/(main)/events/page.tsx')
    expect(page).toContain('CommerceLastVisited')
    expect(page).toContain(`surface="events"`)
    expect(page).toMatch(/sp\.price === 'paid'/)
    expect(page).toMatch(/\{onCommerceFace && <CommerceLastVisited/)
  })

  it('the /marketplace door reads the cookie through the whitelist', () => {
    const door = R('app/(main)/marketplace/page.tsx')
    expect(door).toContain('parseCommerceSurface')
    expect(door).toContain('commerceSurfaceHref')
  })
})
