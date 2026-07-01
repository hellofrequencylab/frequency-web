// Single-source guard (NAV-SYSTEM-REDESIGN.md phase 10). Locks the invariant the whole
// nav unification bought: the `lib/nav` registry is the ONE source, and every surface —
// the public header, both footers, the account menu, the mobile spine, the ⌘K palette —
// is a projection of it, with `lib/site.ts` and `lib/menus/defaults.ts` DERIVING their nav
// from the registry rather than hand-maintaining a parallel list. If a future change
// reintroduces a second source (a hardcoded array, a divergent seed), one of these fails.

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

  it('the calm mobile spine lands on real calm registry nodes', () => {
    const spine = calmSpine()
    expect(spine.length).toBeGreaterThan(0)
    for (const tab of spine) {
      expect(tab.node.mode).toBe('calm')
      expect(REGISTRY_IDS.has(tab.node.id)).toBe(true)
    }
  })
})
