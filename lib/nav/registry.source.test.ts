// Single-source guard (NAV-SYSTEM-REDESIGN.md phase 10). Locks the invariant the whole
// nav unification bought: the `lib/nav` registry is the ONE source, and every surface —
// the public header, both footers, the account menu, the mobile spine, the ⌘K palette —
// is a projection of it, with `lib/site.ts` and `lib/menus/defaults.ts` DERIVING their nav
// from the registry rather than hand-maintaining a parallel list. If a future change
// reintroduces a second source (a hardcoded array, a divergent seed), one of these fails.

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  NAV_REGISTRY,
  headerTriggers,
  marketingFooterLinks,
  footerColumns,
  profileSections,
  calmSpine,
  nodesForSurface,
} from '@/lib/nav/registry'
import { PUBLIC_MEGA_NAV, MARKETING_NAV, PRIMARY_NAV } from '@/lib/site'
import { NAV_AREAS } from '@/lib/nav-areas'
import { defaultMenu } from '@/lib/menus/defaults'

const REGISTRY_IDS = new Set(NAV_REGISTRY.map((n) => n.id))

describe('nav single-source invariant — the registry feeds every surface', () => {
  it('every surface projection emits ONLY registry nodes (no surface invents its own)', () => {
    const emitted = [
      ...headerTriggers().flatMap((t) => [t.node, ...t.items]),
      ...marketingFooterLinks(),
      ...footerColumns().flatMap((c) => c.links),
      ...profileSections().flatMap((s) => s.nodes),
      ...calmSpine().map((t) => t.node),
      ...nodesForSurface('palette'),
    ]
    expect(emitted.length).toBeGreaterThan(0)
    for (const node of emitted) {
      expect(REGISTRY_IDS.has(node.id), `${node.id} is not a registry node`).toBe(true)
    }
  })

  it('the public header is THREE tabs, and every footer link is still reachable from it', () => {
    // LIVE-250 took six to four (Home left, The Lab grouped into About). LIVE-254 takes
    // four to three: The Quest is no longer a top-level pillar. Reachability stays the
    // LIVE-107 half — a page reached as a ROW inside a panel is reached, and `/` is
    // reached by the wordmark.
    const triggers = headerTriggers()
    expect(triggers.length).toBe(3)
    expect(triggers.map((t) => t.node.label)).toEqual(['The Community', 'Spaces', 'About'])

    // Every destination the header offers: a trigger's own landing, or any row in any panel.
    const headerHrefs = new Set(nodesForSurface('header').map((n) => n.href))
    // `/` is the ONE footer link with no header node, because the wordmark carries it. Measured
    // rather than excused: if that Link ever stops pointing home, this case fails with the
    // footer link that lost its path, not with a comment that used to be true.
    const marketingHeader = readFileSync(new URL('../../components/layout/marketing-header.tsx', import.meta.url), 'utf8')
    expect(marketingHeader, 'the wordmark no longer links home, so `/` has no path from the header').toContain(
      "href={authed ? '/feed' : '/'}",
    )
    headerHrefs.add('/')

    for (const link of marketingFooterLinks()) {
      expect(
        [...headerHrefs],
        `footer link ${link.href} (${link.label}) has no path from the public header`,
      ).toContain(link.href)
    }
  })

  it('the tabs that left are still reachable, which is what "grouped, not deleted" means', () => {
    // CORE-MODEL §4: "Nothing is removed. Things are grouped." The cheap way to hit a tab
    // count is to delete destinations, so the count above is paired with this.
    const headerHrefs = nodesForSurface('header').map((n) => n.href)
    expect(headerHrefs, '/the-lab lost its path from the header').toContain('/the-lab')
    expect(headerHrefs, '/the-quest lost its path from the header').toContain('/the-quest')
    const about = headerTriggers().find((t) => t.node.label === 'About')
    expect(about?.items.map((i) => i.href)).toContain('/the-lab')
    const community = headerTriggers().find((t) => t.node.label === 'The Community')
    expect(community?.items.map((i) => i.href)).toContain('/the-quest')
    // The Quest is not a trigger. That is the whole LIVE-254 point.
    expect(headerTriggers().map((t) => t.node.href)).not.toContain('/the-quest')
    const footer = marketingFooterLinks().map((n) => n.href)
    expect(footer).toContain('/')
    expect(footer).toContain('/the-lab')
    expect(footer).toContain('/the-quest')
  })

  it('every DROPDOWN trigger leads with its own landing, or that page has no path from the header', () => {
    // 🔴 THE DEFECT THIS PINS (LIVE-107). A trigger that opens a panel gets NO href of its own
    // (lib/menus/project.ts::categoryTriggers), so its landing page is reachable only as a row
    // INSIDE the panel. Spaces and The Community both opened panels that did not contain their
    // own landing, so /spaces and /the-community had no path from the public header at all.
    // docs/MENU-AUDIT-2026-08-06.md row 3 found the Spaces half and routed the repair to the DB,
    // where an operator patched it by RELABELLING the directory row — which is how the live
    // header came to offer "Spaces directory" and land on the marketing page.
    for (const t of headerTriggers()) {
      if (t.items.length === 0) continue // a plain link: the trigger IS the destination
      expect(
        t.items.map((i) => i.href),
        `the "${t.node.label}" dropdown does not contain its own landing ${t.node.href}, so that page is unreachable from the header`,
      ).toContain(t.node.href)
    }
  })

  it('the public header never links an app-shell twin that robots.txt disallows', () => {
    // A `/discover` canonical and its app-shell twin render the same body, but app/robots.ts
    // disallows the twins so they cannot cannibalise the canonical, and the (main) layout
    // redirects a signed-out visitor off them. A PUBLIC header linking one sends every visitor
    // and every crawler through a noindex bounce to reach a page we publish directly.
    const TWINS = ['/spaces/directory', '/partners', '/journeys']
    for (const node of nodesForSurface('header')) {
      expect(TWINS, `the public header links the app-shell twin ${node.href}`).not.toContain(node.href)
    }
  })

  it('lib/site marketing nav is DERIVED from the registry, not hand-maintained', () => {
    const triggers = headerTriggers()
    // PUBLIC_MEGA_NAV mirrors the header trigger projection (one panel per trigger, same label).
    expect(PUBLIC_MEGA_NAV.map((p) => p.label)).toEqual(triggers.map((t) => t.node.label))
    // PRIMARY_NAV lands on the header triggers (same hrefs, in order).
    expect(PRIMARY_NAV.map((l) => l.href)).toEqual(triggers.map((t) => t.node.href))
    // MARKETING_NAV mirrors the flat marketing footer links (same hrefs, in order).
    expect(MARKETING_NAV.map((l) => l.href)).toEqual(marketingFooterLinks().map((n) => n.href))
  })

  it('lib/menus default surfaces are built from the registry projections', () => {
    // profile: one category per profileSections() section, same labels + item hrefs in order.
    const sections = profileSections()
    const profile = defaultMenu('profile')
    expect(profile.categories.map((c) => c.label)).toEqual(sections.map((s) => s.label))
    profile.categories.forEach((cat, i) => {
      expect(cat.items.map((it) => it.href)).toEqual(sections[i].nodes.map((n) => n.href))
    })
    // footer default = the flat marketing footer links.
    const footer = defaultMenu('footer')
    expect(footer.rootItems.map((it) => it.href)).toEqual(marketingFooterLinks().map((n) => n.href))
  })

  it('the account menu is SEGMENTED (profileSections covers every profile node, grouped)', () => {
    const grouped = profileSections().flatMap((s) => s.nodes.map((n) => n.id))
    const all = nodesForSurface('profile').map((n) => n.id)
    expect(grouped.sort()).toEqual(all.sort())
    // and every section carries a real label (no ungrouped account links).
    for (const s of profileSections()) expect(s.label.length).toBeGreaterThan(0)
  })

  it('no footer link carries a navKey that names nothing (LIVE-250)', () => {
    // ── THE DEFECT ──────────────────────────────────────────────────────────────────────────
    // The member sitemap footer's Market row carried `navKey: 'maker'`, and ADR-868 had retired
    // the Maker rail row — `lib/verticals/maker.ts` declares `nav: []`, so NAV_AREAS has no such
    // key. Nothing threw, because member-footer.tsx reads `NAV_AREA_DEFAULTS[key] ?? 'visitor'`:
    // the row was gated at visitor by ACCIDENT, and `/admin/roles` had no permission-grid row to
    // change it with. A navKey is a DEFERRAL to the rail's access matrix; deferring to a key that
    // does not exist reads as coverage and is not. A keyless link declares its own `gate`, which
    // is the shape every other keyless footer row already uses.
    const areaKeys = new Set(NAV_AREAS.map((a) => a.key))
    const dead = nodesForSurface('footer')
      .filter((n) => n.navKey && !areaKeys.has(n.navKey))
      .map((n) => `${n.label} -> ${n.href} (navKey: ${n.navKey})`)
    expect(dead, 'a footer navKey names no NAV_AREA; drop the key and declare minAccess instead').toEqual([])
    // Positive control: the guard can only be green because the keys resolve, not because no
    // footer row has one.
    expect(nodesForSurface('footer').filter((n) => n.navKey).length).toBeGreaterThan(5)
  })

  it('the calm mobile spine lands on real calm registry nodes', () => {
    const spine = calmSpine()
    expect(spine.length).toBeGreaterThan(0)
    for (const tab of spine) {
      expect(tab.node.mode).toBe('calm')
      expect(REGISTRY_IDS.has(tab.node.id)).toBe(true)
    }
  })

  it('the signed-in phone bar is Feed · Events · Marketplace (HYG-033)', () => {
    // Menu and Zap are shell chrome, not registry nodes. Circles and The Quest stay
    // reachable from the drawer/rail; they are not spine roots.
    const spine = calmSpine()
    expect(spine.map((t) => t.node.id)).toEqual(['feed', 'events', 'market'])
    expect(spine.map((t) => t.label)).toEqual(['Feed', 'Events', 'Marketplace'])
    expect(spine.map((t) => t.node.id)).not.toContain('circles')
    expect(spine.map((t) => t.node.id)).not.toContain('quest')
  })
})
