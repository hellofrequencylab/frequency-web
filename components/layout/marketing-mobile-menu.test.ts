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

// ── LIVE-110: the same sheet now also rides SiteHeader ─────────────────────────────────
// SiteHeader renders on every /discover/* and /help page — the public browse surface the
// sitemap advertises — and its PrimaryNav is `hidden md:block`, so below md a visitor had a
// wordmark, a search glyph and a CTA, and no header navigation at all.
//
// These are source-shape assertions on purpose, and the reason is the same one stated above
// sheetGroups: the sheet only mounts on a tap and `pnpm test` has no browser. What CAN be
// measured as behaviour is measured that way (the gate, below); what cannot is pinned at the
// wiring, because the two defects LIVE-106 found were both wiring — a prop that was never
// passed, and a projection that dropped children.
describe('SiteHeader carries the same sheet, gated for the viewer looking at it', () => {
  const header = () => readFileSync(new URL('./site-header.tsx', import.meta.url), 'utf8')

  it('mounts a phone sheet on BOTH auth paths', () => {
    const t = header()
    // The server path (routes that are dynamic anyway) and the client path (the statically
    // rendered /discover tree, where the viewer arrives after hydration from /api/viewer).
    expect(t).toContain('<MarketingMobileMenu')
    expect(t).toContain('<ViewerMobileMenu')
  })

  it('hands each path the DB-backed headerMenu, not the code default', () => {
    // The operator-edit half, exactly as MarketingHeader owes it: without the prop the sheet
    // falls back to defaultMenu('header') while the bar beside it renders the DB menu, so an
    // edit in the Menu manager reaches the desktop and never a phone.
    const t = header()
    expect(t.match(/headerMenu=\{headerMenu\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('passes the REAL viewer, which is the whole difference from the marketing sheet', () => {
    // MarketingHeader is always logged-out for menu purposes and passes no viewer, so the
    // sheet's 'visitor' default is correct there. SiteHeader is not: a signed-in member on
    // /discover is ordinary, and a sheet defaulted to 'visitor' would hide from that member
    // exactly the rows the desktop bar beside them shows.
    const t = header()
    expect(t).toContain('viewer={{ viewerRole }}')
    expect(t).toContain('isAuth={isAuth}')
  })

  it('keeps the mobile search glyph — a nav sheet does not replace a search field', () => {
    const t = header()
    expect(t).toContain('aria-label="Search"')
    expect(t).toContain('sm:hidden shrink-0 p-2')
  })
})

describe('the sheet footer follows the viewer, not the surface', () => {
  it('does not offer an unconditional "Sign in" + join pair', () => {
    // A member who is already here being invited to sign in, and then to join a beta they are
    // in, is copy that tells them the product does not know them. The pair must sit behind the
    // isAuth branch rather than at the top level of the footer.
    const sheet = readFileSync(new URL('./marketing-mobile-menu.tsx', import.meta.url), 'utf8')
    expect(sheet).toContain('{isAuth ? (')
    // Positive control for that branch: the signed-in arm has somewhere to go.
    expect(sheet).toContain('Your feed')
  })

  it('a signed-in viewer and a visitor gate to different rows', () => {
    // The behavioural half — sheetGroups is pure, so this one is measured rather than pinned.
    const memberOnly: ResolvedMenu = {
      ...defaultMenu('header'),
      isDefault: false,
      categories: [
        {
          id: 'c-gate',
          label: 'Community',
          position: 0,
          colSpan: 1,
          children: [],
          items: [
            { id: 'i-pub', label: 'Public', href: '/pub', position: 0, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'visitor' },
            { id: 'i-mem', label: 'Members', href: '/mem', position: 1, colSpan: 1, mode: 'active', roleModes: {}, minAccess: 'member' },
          ],
        },
      ],
    }
    const seen = (v: MenuViewer) => sheetGroups(memberOnly, v).flatMap((g) => g.items.map((i) => i.href))
    expect(seen({ viewerRole: 'visitor' })).toEqual(['/pub'])
    expect(seen({ viewerRole: 'member' })).toEqual(['/pub', '/mem'])
  })
})
