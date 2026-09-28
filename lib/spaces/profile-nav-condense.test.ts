import { describe, expect, it } from 'vitest'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'
import {
  SPACE_MENU_LEAD_SEGMENTS,
  SPACE_MENU_VISIBLE_BUDGET,
  condenseSpaceProfileNav,
  keepActiveVisible,
} from '@/lib/spaces/profile-nav-condense'

// The pure half of the condensed Space menu (LIVE-529). The invariant that matters is not the order
// — it is that CONDENSING IS NOT HIDING: every row handed in comes back out, exactly once, in one of
// the two halves. Everything else here is the ranking that makes the fold stable.

const base = '/spaces/temple'

/** The worst realistic menu: every dedicated tab a Space can earn, plus both unbounded sources. */
function fullTabs(): SpaceProfileTab[] {
  return [
    { href: base, label: 'Home' },
    { href: `${base}#book`, label: 'Book' },
    { href: `${base}#offerings`, label: 'Offerings' },
    { href: `${base}#practices`, label: 'Practices' },
    { href: `${base}#faq`, label: 'FAQ' },
    { href: `${base}/calendar`, label: 'Calendar' },
    { href: `${base}/memberships`, label: 'Memberships' },
    { href: `${base}/collaborators`, label: 'Collaborators' },
    { href: `${base}/circles`, label: 'Circles' },
    { href: `${base}/people`, label: 'People' },
    { href: `${base}/contact`, label: 'Contact' },
    { href: `${base}/reviews`, label: 'Reviews' },
    { href: `${base}/shop`, label: 'The Apothecary' },
    { href: `${base}/retreats`, label: 'Retreats' },
    { href: `${base}/teachers`, label: 'Our teachers' },
  ]
}

describe('the budget', () => {
  it('is small enough to be a condense and large enough to be a menu', () => {
    expect(SPACE_MENU_VISIBLE_BUDGET).toBeGreaterThanOrEqual(3)
    expect(SPACE_MENU_VISIBLE_BUDGET).toBeLessThanOrEqual(5)
  })
})

describe('condenseSpaceProfileNav loses nothing', () => {
  it('returns every row exactly once across the two halves', () => {
    const tabs = fullTabs()
    const { primary, overflow } = condenseSpaceProfileNav(tabs)
    const out = [...primary, ...overflow].map((t) => t.href)
    expect(out.slice().sort()).toEqual(tabs.map((t) => t.href).sort())
    expect(new Set(out).size, 'a row appears in both halves').toBe(out.length)
  })

  it('holds the visible row count at the budget', () => {
    expect(condenseSpaceProfileNav(fullTabs()).primary).toHaveLength(SPACE_MENU_VISIBLE_BUDGET)
  })

  it('folds nothing when the menu already fits', () => {
    const tabs = fullTabs().slice(0, SPACE_MENU_VISIBLE_BUDGET)
    const { primary, overflow } = condenseSpaceProfileNav(tabs)
    expect(overflow).toEqual([])
    expect(primary).toHaveLength(tabs.length)
  })

  it('keeps Home visible, because the index is the page every other row hangs off', () => {
    expect(condenseSpaceProfileNav(fullTabs()).primary[0]?.href).toBe(base)
  })

  it('survives an empty menu and a Home-only menu', () => {
    expect(condenseSpaceProfileNav([])).toEqual({ primary: [], overflow: [] })
    const only = [{ href: base, label: 'Home' }]
    expect(condenseSpaceProfileNav(only)).toEqual({ primary: only, overflow: [] })
  })

  it('still keeps Home when the budget is degenerate', () => {
    for (const budget of [0, 1, -3]) {
      const { primary, overflow } = condenseSpaceProfileNav(fullTabs(), budget)
      expect(primary.map((t) => t.href)).toEqual([base])
      expect(primary.length + overflow.length).toBe(fullTabs().length)
    }
  })
})

describe('the fold is stable against the two unbounded sources', () => {
  // This is the whole reason the ranking exists rather than taking the list in source order: the
  // Home section anchors and the operator's custom pages have no ceiling, and in source order they
  // sit AHEAD of (anchors) or level with (custom pages) the dedicated destinations.
  it('folds Home section anchors before any destination', () => {
    const { primary, overflow } = condenseSpaceProfileNav(fullTabs())
    expect(primary.some((t) => t.href.includes('#'))).toBe(false)
    expect(overflow.filter((t) => t.href.includes('#'))).toHaveLength(4)
  })

  it('folds an operator custom page before a dedicated destination', () => {
    const { overflow } = condenseSpaceProfileNav(fullTabs())
    expect(overflow.map((t) => t.href)).toContain(`${base}/retreats`)
  })

  it('adding twenty Home sections does not change which destinations are visible', () => {
    const lean = fullTabs()
    const noisy = [
      lean[0],
      ...Array.from({ length: 20 }, (_, i) => ({ href: `${base}#s${i}`, label: `Section ${i}` })),
      ...lean.slice(1),
    ]
    expect(condenseSpaceProfileNav(noisy).primary.map((t) => t.label)).toEqual(
      condenseSpaceProfileNav(lean).primary.map((t) => t.label),
    )
  })

  it('shows Calendar, Circles and Memberships to a Space that has all three', () => {
    // The documented lead order, asserted as the outcome rather than restated as the list.
    expect(condenseSpaceProfileNav(fullTabs()).primary.map((t) => t.label)).toEqual([
      'Home',
      'Calendar',
      'Circles',
      'Memberships',
    ])
  })

  it('ranks by path segment, never by the operator renameable label', () => {
    // The Shop tab's word is `storefront.tabLabel`, free text. A label-keyed rank would hand the
    // ranking to whoever types it.
    const tabs: SpaceProfileTab[] = [
      { href: base, label: 'Home' },
      { href: `${base}/aardvark`, label: 'Calendar' },
      { href: `${base}/shop`, label: 'The Apothecary' },
    ]
    const { primary } = condenseSpaceProfileNav(tabs, 2)
    expect(primary[1]?.href).toBe(`${base}/shop`)
  })

  it('ranks every lead segment ahead of a custom page and an anchor', () => {
    for (const segment of SPACE_MENU_LEAD_SEGMENTS) {
      const { primary } = condenseSpaceProfileNav(
        [
          { href: base, label: 'Home' },
          { href: `${base}#somewhere`, label: 'Somewhere' },
          { href: `${base}/a-custom-page`, label: 'Custom' },
          { href: `${base}/${segment}`, label: segment },
        ],
        2,
      )
      expect(primary[1]?.href, segment).toBe(`${base}/${segment}`)
    }
  })

  it('ignores a trailing slash and a query when reading the segment', () => {
    const { primary } = condenseSpaceProfileNav(
      [
        { href: base, label: 'Home' },
        { href: `${base}/zzz`, label: 'Custom' },
        { href: `${base}/calendar/?view=month`, label: 'Calendar' },
      ],
      2,
    )
    expect(primary[1]?.label).toBe('Calendar')
  })
})

describe('keepActiveVisible never folds the row you are standing on', () => {
  const onReviews = (t: SpaceProfileTab) => t.href === `${base}/reviews`

  it('promotes the active row into the bar', () => {
    const folded = condenseSpaceProfileNav(fullTabs())
    expect(folded.overflow.some(onReviews), 'precondition: Reviews starts folded').toBe(true)
    const kept = keepActiveVisible(folded, onReviews)
    expect(kept.primary.some(onReviews)).toBe(true)
    expect(kept.overflow.some(onReviews)).toBe(false)
  })

  it('costs no extra visible row, and still loses nothing', () => {
    const folded = condenseSpaceProfileNav(fullTabs())
    const kept = keepActiveVisible(folded, onReviews)
    expect(kept.primary).toHaveLength(folded.primary.length)
    expect([...kept.primary, ...kept.overflow].map((t) => t.href).sort()).toEqual(
      [...folded.primary, ...folded.overflow].map((t) => t.href).sort(),
    )
  })

  it('demotes the lowest-ranked visible row, never Home', () => {
    const kept = keepActiveVisible(condenseSpaceProfileNav(fullTabs()), onReviews)
    expect(kept.primary[0]?.href).toBe(base)
    expect(kept.overflow[0]?.label).toBe('Memberships')
  })

  it('is a no-op when the active row is already visible, or nothing is active', () => {
    const folded = condenseSpaceProfileNav(fullTabs())
    expect(keepActiveVisible(folded, (t) => t.href === base)).toEqual(folded)
    expect(keepActiveVisible(folded, () => false)).toEqual(folded)
  })

  it('leaves Home alone when there is only one visible slot to trade', () => {
    const folded = condenseSpaceProfileNav(fullTabs(), 1)
    expect(keepActiveVisible(folded, onReviews)).toEqual(folded)
  })
})
