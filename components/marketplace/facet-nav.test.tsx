import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKET_AREAS,
  visibleAreas,
  areaFlagKey,
  type MarketArea,
} from '@/lib/marketplace/visibility'

// LIVE-245. The operator switch reached the member nav and the route (app/(main)/layout.tsx) and
// the hidden-area banner, but never the MARKETPLACE AREA NAV: MarketplaceFacets and
// MarketplaceGuide typed all five areas with no visibility input, so both rendered a Frequency
// Store entry on every commerce surface while marketplace_shop_published was false in production,
// and a member who clicked it was redirected to /feed.
//
// Two halves are tested here. The DECISION is pure, so every case is driven for real rather than
// asserted about. The WIRING is a source shape, because an async server component reading two
// React-cached Supabase helpers cannot be rendered in this environment; what makes that acceptable
// is that the shape guards are specific (each names the symbol that must be imported and the one
// that must NOT be re-typed) rather than a grep for the row's own words.

const ALL_PUBLISHED: Record<MarketArea, boolean> = {
  market: true,
  housing: true,
  makers: true,
  shop: true,
}
/** What marketplaceVisibility returns on a read error (fail-closed, scan2 L3-07). */
const ALL_HIDDEN: Record<MarketArea, boolean> = {
  market: false,
  housing: false,
  makers: false,
  shop: false,
}

const NAV = readFileSync(join(process.cwd(), 'components/marketplace/facet-nav.tsx'), 'utf8')
const GUIDE = readFileSync(
  join(process.cwd(), 'components/marketplace/marketplace-guide.tsx'),
  'utf8',
)

/** Drop line comments, so a guard about what the CODE says is not answered by a comment that
 *  explains the guard. Both files document the flag by name on purpose. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n')
}

describe('visibleAreas — the decision the commerce navs render', () => {
  it('shows every area when every flag is published', () => {
    expect(visibleAreas(ALL_PUBLISHED, false)).toEqual([...MARKET_AREAS])
  })

  it('drops the Frequency Store for a member when marketplace_shop_published is false', () => {
    // The live production state since 2026-07-11, and the defect this row was filed for.
    const out = visibleAreas({ ...ALL_PUBLISHED, shop: false }, false)
    expect(out).not.toContain('shop')
    expect(out).toEqual(['market', 'housing', 'makers'])
  })

  it('keeps a hidden area visible to an operator, so it can be stocked', () => {
    expect(visibleAreas({ ...ALL_PUBLISHED, shop: false }, true)).toEqual([...MARKET_AREAS])
    expect(visibleAreas(ALL_HIDDEN, true)).toEqual([...MARKET_AREAS])
  })

  it('shows a member nothing when the visibility read failed', () => {
    // Fail-closed: an outage must not publish an area an operator un-published.
    expect(visibleAreas(ALL_HIDDEN, false)).toEqual([])
  })

  it('hides exactly the areas whose flag is false, one at a time', () => {
    for (const hidden of MARKET_AREAS) {
      const out = visibleAreas({ ...ALL_PUBLISHED, [hidden]: false }, false)
      expect(out).not.toContain(hidden)
      expect(out).toHaveLength(MARKET_AREAS.length - 1)
    }
  })

  it('names the flag each area answers to', () => {
    expect(areaFlagKey('shop')).toBe('marketplace_shop_published')
  })
})

describe('the two commerce navs are wired to that decision', () => {
  it('MarketplaceFacets still declares the Frequency Store, so the flag alone brings it back', () => {
    // The owner ruling's promise is "flipping it the day real merch exists is a one-row change".
    // Deleting the entry would break that promise rather than keep it.
    expect(NAV).toContain("href: '/store'")
    expect(NAV).toContain("area: 'shop'")
  })

  it('MarketplaceFacets filters through browsableAreas rather than rendering the list', () => {
    expect(NAV).toContain('browsableAreas')
    expect(NAV).toContain('export async function MarketplaceFacets')
    expect(NAV).not.toMatch(/\{AREAS\.map\(/)
  })

  it('MarketplaceGuide filters through the same read', () => {
    expect(GUIDE).toContain('browsableAreas')
    expect(GUIDE).toContain('export async function MarketplaceGuide')
    expect(GUIDE).not.toMatch(/\{SURFACES\.map\(/)
  })

  it('neither nav re-types the area set it is gating on', () => {
    // A second copy of MARKET_AREAS in a component is how the five-way nav and the two-way
    // last-visited cookie drifted apart in the first place (LIVE-243).
    for (const src of [NAV, GUIDE]) {
      expect(code(src)).not.toContain('marketplace_shop_published')
      expect(code(src)).not.toMatch(/const MARKET_AREAS/)
    }
  })

  it('Events is not a switchable market area in either nav', () => {
    // It is a member noun with its own rail row; the marketplace flag set has no events key.
    expect(MARKET_AREAS).not.toContain('events' as MarketArea)
    expect(NAV).toContain('area: null')
    expect(GUIDE).toContain('area: null')
  })
})
