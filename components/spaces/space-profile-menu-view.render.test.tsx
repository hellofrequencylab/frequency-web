// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SpaceProfileMenuView } from './space-profile-menu-view'
import { SPACE_MENU_VISIBLE_BUDGET } from '@/lib/spaces/profile-nav-condense'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE CONDENSED SPACE MENU, MEASURED IN A DOM (LIVE-529).
//
// WHAT THIS IS FOR. The Space menu was a flat `overflow-x-auto` scroller holding every tab, which on
// a 360px phone put roughly 210px of a Space's own navigation past the right edge, behind a
// horizontal drag with no visible scrollbar to suggest it. The fix folds the tail into a "More"
// disclosure — and the ONE way that fix can go wrong is by becoming a hide. So this file asserts the
// consequence rather than the mechanism: mount the worst realistic row set and check that EVERY
// destination is still reachable, as a visible row or as a real link inside the disclosure, while the
// visible row count stays at or under the budget.
//
// It measures reachability, not pixels: there is no browser in `pnpm test`, so the honest claim a DOM
// test can make is "nothing was dropped and the count is bounded". The pixel reasoning behind the
// number lives on SPACE_MENU_VISIBLE_BUDGET.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const base = '/spaces/temple'

/** Every dedicated tab a Space can earn, plus both UNBOUNDED sources (Home anchors, custom pages). */
const FULL: SpaceProfileTab[] = [
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

const nav = (el: HTMLElement) => {
  const n = el.querySelector('nav')
  if (!n) throw new Error('the Space menu rendered no nav at all')
  return n
}
/** The rows the BAR shows: direct <a> children of the nav. Folded links sit inside the <details>. */
const visibleRows = (el: HTMLElement) => [...nav(el).querySelectorAll(':scope > a')]
const disclosure = (el: HTMLElement) => nav(el).querySelector('details')
/** Every href the menu offers, wherever it offers it. */
const allHrefs = (el: HTMLElement) => [...nav(el).querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))

describe('the condensed menu keeps every destination reachable', () => {
  it('offers every row, as a visible pill or inside the disclosure', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const offered = allHrefs(el)
    for (const tab of FULL) {
      expect(offered, `${tab.label} (${tab.href}) is reachable from nowhere in the menu`).toContain(tab.href)
    }
  })

  it('offers each one exactly once, so no destination has two rows', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const offered = allHrefs(el)
    expect(offered).toHaveLength(FULL.length)
    expect(new Set(offered).size).toBe(FULL.length)
  })

  it('holds the visible row count at or under the budget', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(visibleRows(el).length).toBeLessThanOrEqual(SPACE_MENU_VISIBLE_BUDGET)
  })

  it('puts the whole remainder in the disclosure, not on the floor', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const shown = visibleRows(el).map((a) => a.getAttribute('href'))
    const folded = [...(disclosure(el)?.querySelectorAll('a[href]') ?? [])].map((a) => a.getAttribute('href'))
    expect(shown.length + folded.length).toBe(FULL.length)
    expect([...shown, ...folded].sort()).toEqual(FULL.map((t) => t.href).sort())
  })

  it('keeps Home visible', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(visibleRows(el)[0]?.getAttribute('href')).toBe(base)
  })

  it('folds nothing, and grows no disclosure, when the menu already fits', () => {
    const fits = FULL.slice(0, SPACE_MENU_VISIBLE_BUDGET)
    const el = mount(<SpaceProfileMenuView tabs={fits} pathname={base} />)
    expect(disclosure(el)).toBeNull()
    expect(visibleRows(el)).toHaveLength(fits.length)
  })

  it('leaves the folded links in the markup even while the disclosure is shut', () => {
    // The share URL is prerendered and crawled. A fold that emitted its hrefs only on open would
    // cost the Space every folded link in the HTML a crawler reads.
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const d = disclosure(el)
    expect(d?.open).toBe(false)
    expect((d?.querySelectorAll('a[href]') ?? []).length).toBeGreaterThan(0)
  })
})

describe('the disclosure can actually be opened', () => {
  it('is named, and the name stands on its own', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const summary = disclosure(el)?.querySelector('summary')
    expect(summary).not.toBeNull()
    // The accessible name is the summary's contents. The visible word is a prefix of it, which is
    // what WCAG 2.5.3 (Label in Name) asks for.
    expect(summary?.textContent).toContain('More')
    expect((summary?.textContent ?? '').trim().length).toBeGreaterThan('More'.length)
  })

  it('opens on a click, the way a native disclosure does', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    const d = disclosure(el)!
    const summary = d.querySelector('summary')!
    act(() => summary.click())
    expect(d.open, 'the summary does not toggle its own details').toBe(true)
  })

  it('is a summary, so it is focusable and takes Enter and Space with no JavaScript', () => {
    // This file cannot hold client state (the view has no 'use client' and a server page imports it),
    // so the disclosure has to be the native one. Asserting the ELEMENT is asserting the keyboard.
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} />)
    expect(disclosure(el)?.firstElementChild?.tagName).toBe('SUMMARY')
  })
})

describe('the menu still answers "where am I"', () => {
  it('promotes the row you are standing on out of the fold', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={`${base}/reviews`} />)
    const shown = visibleRows(el).map((a) => a.getAttribute('href'))
    expect(shown, 'the active row is folded, so the menu cannot say where you are').toContain(
      `${base}/reviews`,
    )
    expect(visibleRows(el).length).toBeLessThanOrEqual(SPACE_MENU_VISIBLE_BUDGET)
  })

  it('marks it as the current page, and marks only it', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={`${base}/reviews`} />)
    const current = [...nav(el).querySelectorAll('a[aria-current="page"]')]
    expect(current.map((a) => a.getAttribute('href'))).toEqual([`${base}/reviews`])
  })

  it('lights the disclosure when the active row is a deeper path inside the fold', () => {
    // A sub-path of a folded destination cannot be promoted by href match, so the chip carries the
    // state instead. `keepActiveVisible` promotes it here too, which is the better outcome; either
    // way the viewer is never left with nothing lit.
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={`${base}/retreats/summer`} />)
    const lit = [...nav(el).querySelectorAll('[aria-current="page"]')]
    expect(lit.length).toBeGreaterThan(0)
  })
})

describe('the owner keeps their console entry', () => {
  it('shows Manage beside the fold, and it is not one of the budgeted rows', () => {
    const el = mount(<SpaceProfileMenuView tabs={FULL} pathname={base} canManage />)
    const manage = [...nav(el).querySelectorAll('a[href]')].find((a) =>
      (a.getAttribute('href') ?? '').includes('panel=manage'),
    )
    expect(manage, 'the owner lost their Manage entry to the fold').toBeTruthy()
    expect(visibleRows(el).length).toBeLessThanOrEqual(SPACE_MENU_VISIBLE_BUDGET)
  })
})
