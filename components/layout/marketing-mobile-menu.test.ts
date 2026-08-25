import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { sheetGroups } from './marketing-mobile-menu'
import { categoryTriggers } from '@/lib/menus/project'
import { defaultMenu } from '@/lib/menus/defaults'
import { flattenCategoryTree } from './menu-role'
import type { MenuViewer } from './menu-role'
import type { ResolvedMenu } from '@/lib/menus/types'

// ── THE PHONE NAV REACHABILITY CONTRACT (LIVE-106) ──────────────────────────────────────────
//
// WHAT BROKE. `MarketingMobileMenu` mapped `headerTriggers()` FLAT — one row per parentless
// registry trigger node. A trigger that opens a dropdown carries its destinations as CHILDREN,
// so on a phone every child simply did not exist. Measured on 2026-08-24 against the code
// default: THIRTEEN destinations had no path below md, including all five /for/* conversion
// landing pages, /pricing, /help, /privacy, /terms and the Spaces directory. The desktop bar
// showed all of them, so nothing looked wrong to anyone testing on a laptop.
//
// (The row that recorded this said twenty, and listed fifteen. Four of the six /discover/*
// surfaces it named were in fact reachable — the sheet also rendered a hand-kept DISCOVER_NAV
// block covering them — and it missed /spaces/directory and /what-is-frequency, which were not.
// The real number is thirteen. Re-measured before the work, per ADR-1082.)
//
// AND THE SECOND HALF. `MarketingHeader` passed only `light` to the sheet, so PrimaryNav beside
// it rendered the DB-backed menu and the sheet rendered the code default. An operator editing
// the marketing menu saw the change on desktop and never on a phone.
//
// WHY THESE ASSERTIONS AND NOT A RENDER. The sheet only mounts on a tap and this repo has no
// browser in `pnpm test`, so the honest thing a unit test can hold is the CONTENT MODEL the
// render walks — `sheetGroups` — measured against the desktop bar's own projection. The pixel
// half (the disclosure animating, the safe-area gutters) is the e2e suite's job.

const VISITOR: MenuViewer = { viewerRole: 'visitor' }

/** Every destination the DESKTOP bar offers for this menu: a panel category's items (children
 *  folded in), or a plain category's single landing. The set the phone must match. */
function desktopDestinations(menu: ResolvedMenu): string[] {
  const out: string[] = []
  for (const t of categoryTriggers(menu)) {
    if (t.hasPanel) out.push(...flattenCategoryTree(t.category, () => true).map((i) => i.href))
    else if (t.href) out.push(t.href)
  }
  return [...new Set(out)]
}

/** Every destination the PHONE sheet offers. */
function phoneDestinations(menu: ResolvedMenu): string[] {
  const out: string[] = []
  for (const g of sheetGroups(menu, VISITOR)) {
    out.push(...g.items.map((i) => i.href))
    if (g.href) out.push(g.href)
  }
  return [...new Set(out)]
}

describe('the phone sheet reaches everything the desktop bar reaches', () => {
  it('loses nothing from the code default', () => {
    const menu = defaultMenu('header')
    const desktop = desktopDestinations(menu)
    expect(desktop.length).toBeGreaterThan(20)
    for (const href of desktop) {
      expect(phoneDestinations(menu), `${href} has no path on a phone`).toContain(href)
    }
  })

  it('reaches the thirteen that had no path before', () => {
    // The exact set measured on 2026-08-24. Named one by one rather than counted, because a
    // count passes the day someone swaps one destination for another.
    const WAS_UNREACHABLE = [
      '/discover/partners',
      '/discover/practices',
      '/discover/spaces', // was /spaces/directory, the robots-disallowed app-shell twin
      '/for/coaches-and-healers',
      '/for/community-builders',
      '/for/event-hosts',
      '/for/nonprofits',
      '/for/studios',
      '/pricing',
      '/what-is-frequency',
      '/help',
      '/privacy',
      '/terms',
    ]
    const phone = phoneDestinations(defaultMenu('header'))
    for (const href of WAS_UNREACHABLE) expect(phone, `${href} is still unreachable`).toContain(href)
  })

  it('a category with child COLUMNS folds them in rather than dropping them', () => {
    // The panel shape the admin header uses. A naive `category.items` read loses every row in a
    // child column; flattenCategoryTree is what stops that.
    const nested: ResolvedMenu = {
      surfaceKey: 'header',
      label: 'Header menu',
      columns: 6,
      rootItems: [],
      railCards: [],
      isDefault: false,
      categories: [
        {
          id: 'c1',
          label: 'Parent',
          position: 0,
          colSpan: 1,
          items: [
            { id: 'i1', label: 'A', href: '/a', position: 0, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor' },
            { id: 'i2', label: 'B', href: '/b', position: 1, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor' },
          ],
          children: [
            {
              id: 'c2',
              label: 'Child column',
              position: 0,
              colSpan: 1,
              items: [
                { id: 'i3', label: 'C', href: '/c', position: 0, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor' },
              ],
              children: [],
            },
          ],
        },
      ],
    }
    expect(phoneDestinations(nested)).toEqual(['/a', '/b', '/c'])
  })
})

describe('the sheet gates like the bar, and takes the menu the bar takes', () => {
  it('hides an item the visitor may not see', () => {
    const gated: ResolvedMenu = {
      ...defaultMenu('header'),
      isDefault: false,
      categories: [
        {
          id: 'c1',
          label: 'Members',
          position: 0,
          colSpan: 1,
          children: [],
          items: [
            { id: 'i1', label: 'Public', href: '/pub', position: 0, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor' },
            { id: 'i2', label: 'Members only', href: '/priv', position: 1, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'member' },
          ],
        },
      ],
    }
    expect(phoneDestinations(gated)).toEqual(['/pub'])
  })

  it('MarketingHeader hands the sheet the SAME headerMenu it hands PrimaryNav', () => {
    // The operator-edit half. Without this prop the sheet falls back to the code default and the
    // Menu manager silently means nothing on the surface most visitors read.
    const header = readFileSync(new URL('./marketing-header.tsx', import.meta.url), 'utf8')
    expect(header).toContain('<MarketingMobileMenu light={light} headerMenu={headerMenu} />')
  })

  it('no longer projects the registry triggers flat — that projection IS the bug', () => {
    const sheet = readFileSync(new URL('./marketing-mobile-menu.tsx', import.meta.url), 'utf8')
    expect(sheet).not.toContain('headerTriggers')
    // And it does not keep a second, hand-maintained copy of the Discover links beside the menu.
    expect(sheet).not.toContain('DISCOVER_NAV')
  })
})
