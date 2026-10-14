import { describe, expect, it } from 'vitest'

import { applyRegistryGates, registryGateFor, normalizeGateHref, REGISTRY_GATES } from './gates'
import { defaultMenu } from './defaults'
import { STUDIO_LEAVES } from '@/lib/nav/studio'
import type { ResolvedItem, ResolvedMenu } from './types'

// The gate contract (owner decision 2026-08-06, docs/MENU-AUDIT-2026-08-06.md §4.2-§4.4).
// Each case below is a REAL row that was live in production when the audit ran, so this file
// is the record of what went wrong as much as it is a guard against it happening again.

function item(over: Partial<ResolvedItem> & Pick<ResolvedItem, 'href'>): ResolvedItem {
  return {
    id: 'i', label: 'L', position: 0, colSpan: 1, mode: 'active', roleModes: {},
    minAccess: 'visitor', ...over,
  }
}

function menuOf(items: ResolvedItem[], label = 'Admin'): ResolvedMenu {
  return {
    surfaceKey: 'left', label: 'Left', columns: 1, isDefault: false, rootItems: [], railCards: [],
    categories: [{ id: 'c', label, position: 0, colSpan: 1, minAccess: 'visitor', items, children: [] }],
  }
}

describe('normalizeGateHref', () => {
  it('drops the query, the fragment, and a trailing slash', () => {
    expect(normalizeGateHref('/admin/vera-ai?tab=vera')).toBe('/admin/vera-ai')
    expect(normalizeGateHref('/admin/crm#top')).toBe('/admin/crm')
    expect(normalizeGateHref('/admin/qr/')).toBe('/admin/qr')
  })
  it('leaves the root alone', () => {
    expect(normalizeGateHref('/')).toBe('/')
  })
})

describe('the registry gate map', () => {
  it('knows the operator destinations the live rail links to', () => {
    for (const href of ['/admin', '/admin/marketplace', '/admin/community', '/admin/growth', '/admin/qr']) {
      expect(registryGateFor(href), href).not.toBeNull()
    }
  })
  it('carries the staff domains the live DB rows had deleted', () => {
    // §4.3: six rows lost their staff_domain in the database, silently disabling the second
    // axis of the ADR-390 union gate for staff-only operators.
    expect(registryGateFor('/admin/community')?.staffDomain).toBe('community')
    expect(registryGateFor('/admin/growth')?.staffDomain).toBe('marketing')
    expect(registryGateFor('/admin/operations')?.staffDomain).toBe('platform')
    expect(registryGateFor('/admin/qr')?.staffDomain).toBe('qr')
    expect(registryGateFor('/admin/library')?.staffDomain).toBe('marketing')
    expect(registryGateFor('/admin/vera-ai')?.staffDomain).toBe('insights')
  })
  it('is non-empty (the registry actually loaded)', () => {
    expect(REGISTRY_GATES.size).toBeGreaterThan(20)
  })
})

describe('applyRegistryGates — the bugs that were live', () => {
  it('re-gates the Admin > Market row that was seeded open to visitors', () => {
    // §4.2: the exact live row. Every logged-in member saw an "Admin" group because of it.
    const out = applyRegistryGates(menuOf([item({ href: '/admin/marketplace', minAccess: 'visitor' })]))
    expect(out.categories[0].items[0].minAccess).not.toBe('visitor')
    expect(out.categories[0].items[0].minAccess).toBe(registryGateFor('/admin/marketplace')!.minAccess)
  })

  it('restores a staff domain the database had dropped', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/admin/growth', staffDomain: undefined })]))
    expect(out.categories[0].items[0].staffDomain).toBe('marketing')
  })

  it('removes a staff domain the database invented', () => {
    // §4.4: the live Manage Spaces row carried staff_domain 'profiles'; the code declares none.
    const out = applyRegistryGates(menuOf([item({ href: '/admin/spaces', staffDomain: 'profiles' })]))
    expect(out.categories[0].items[0].staffDomain).toBe(registryGateFor('/admin/spaces')!.staffDomain)
  })

  it('re-gates Journal, which was seeded visitor against a member default', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/journal', minAccess: 'visitor' })]))
    expect(out.categories[0].items[0].minAccess).toBe(registryGateFor('/journal')!.minAccess)
  })
})

describe('applyRegistryGates — what the operator keeps', () => {
  it('never touches mode, so switching a link OFF in the Menu Manager still works', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/admin/marketplace', mode: 'hidden' })]))
    expect(out.categories[0].items[0].mode).toBe('hidden')
  })

  it('never touches role modes, label, icon, or position', () => {
    const out = applyRegistryGates(
      menuOf([
        item({
          href: '/circles', label: 'My renamed row', icon: 'Sparkles', position: 7,
          roleModes: { visitor: 'ghost' },
        }),
      ]),
    )
    const row = out.categories[0].items[0]
    expect(row.label).toBe('My renamed row')
    expect(row.icon).toBe('Sparkles')
    expect(row.position).toBe(7)
    expect(row.roleModes).toEqual({ visitor: 'ghost' })
  })
})

describe('applyRegistryGates — the unknown-href floor', () => {
  it('holds an undeclared /admin page at admin, however it was seeded', () => {
    // The escape hatch (an operator adding a page the registry never declared) has to exist.
    // It must not be the hole that opens an operator surface to the public.
    const out = applyRegistryGates(menuOf([item({ href: '/admin/not-in-the-registry', minAccess: 'visitor' })]))
    expect(out.categories[0].items[0].minAccess).toBe('admin')
  })

  it('Business Seeder is NOT one of these — the registry declares it', () => {
    // The audit (§4.4) called this row DB-only because it is not a NAV_AREA. It is a Studio
    // leaf, so the registry does gate it, at janitor. Worth pinning: it is the difference
    // between "the escape hatch is in use on the live rail" and "it is not."
    expect(registryGateFor('/admin/business-seeder')?.minAccess).toBe('janitor')
  })

  it('does not LOWER a stricter floor on an undeclared operator page', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/admin/nowhere', minAccess: 'janitor' })]))
    expect(out.categories[0].items[0].minAccess).toBe('janitor')
  })

  it('leaves an undeclared MEMBER page stored gate alone', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/some/custom/page', minAccess: 'member' })]))
    expect(out.categories[0].items[0].minAccess).toBe('member')
  })
})

describe('applyRegistryGates — the derived category floor', () => {
  it('gives a group the LOWEST floor among its rows, so a header never over-advertises', () => {
    const out = applyRegistryGates(
      menuOf([item({ href: '/admin', id: 'a' }), item({ href: '/lead', id: 'b' })]),
    )
    const floors = out.categories[0].items.map((i) => i.minAccess)
    expect(floors).toContain(out.categories[0].minAccess)
  })

  it('an Admin group of admin-only rows is no longer floored at visitor', () => {
    // This is what made the leak VISIBLE: the live Admin category was seeded 'visitor', and
    // menuToSections rendered the header off any one passing item.
    const out = applyRegistryGates(menuOf([item({ href: '/admin/marketplace', minAccess: 'visitor' })]))
    expect(out.categories[0].minAccess).not.toBe('visitor')
  })

  it('carries a staff domain up from a row, so staff reach the group they belong to', () => {
    const out = applyRegistryGates(menuOf([item({ href: '/admin/growth' })]))
    expect(out.categories[0].staffDomain).toBe('marketing')
  })
})

describe('applyRegistryGates — idempotence on the code defaults', () => {
  it('is a no-op for every code-default surface (their gates already come from the registry)', () => {
    for (const surface of ['header', 'left', 'footer', 'profile', 'admin_header'] as const) {
      const before = defaultMenu(surface)
      const after = applyRegistryGates(before)
      // Same gates in, same gates out — deep-equal on the parts the contract owns.
      expect(after.rootItems.map((i) => [i.href, i.minAccess, i.staffDomain]), surface).toEqual(
        before.rootItems.map((i) => [i.href, i.minAccess, i.staffDomain]),
      )
    }
  })

  it('applying twice equals applying once', () => {
    const once = applyRegistryGates(menuOf([item({ href: '/admin/marketplace', minAccess: 'visitor' })]))
    const twice = applyRegistryGates(once)
    expect(twice).toEqual(once)
  })
})

// ── Loom Studio keeps its own gate inside Content (ADR-979, amended by ADR-1745) ─────────────────
// /admin/library once matched NO section, so its sub-nav band drew empty, and it could not be filed
// under a neighbour because adminHeaderMenu() stamped the SECTION's gate onto every item: Growth
// (host + marketing) would have offered a janitor-only tool to hosts, and Operations (janitor +
// platform) would have dropped it for a marketing-domain janitor. ADR-1745 moved the gate onto the
// leaf, so it now files under Content (its leaf's own `world`) and STILL carries janitor + marketing.
type Cat = ReturnType<typeof defaultMenu>['categories'][number]
const allItems = (c: Cat): ResolvedItem[] => [...c.items, ...c.children.flatMap(allItems)]

describe('Loom Studio under Content (ADR-979, ADR-1745)', () => {
  const menu = defaultMenu('admin_header')
  const section = menu.categories.find((c) => allItems(c).some((i) => i.href === '/admin/library'))

  it('resolves to a section at all, so the sub-nav band is not empty', () => {
    expect(section, '/admin/library must match an admin_header section').toBeDefined()
    expect(section!.label).toBe('Content')
  })

  it('carries its OWN gate rather than inheriting its section\'s', () => {
    // BOTH halves: a gate assertion that only covers one axis misses half the ways it breaks.
    //   staffDomain 'community' -> it inherited Content's domain; a marketing-domain janitor lost it.
    //   minAccess  'host'       -> it inherited Content's floor, and it is now offered to hosts.
    const item = allItems(section!).find((i) => i.href === '/admin/library')!
    expect(item.staffDomain).toBe('marketing')
    expect(item.minAccess).toBe('janitor')
  })
})

// ── The consolidated operator console (ADR-1745) ─────────────────────────────────────────────────
describe('admin_header is seven job sections, each item gated by its own page (ADR-1745)', () => {
  const menu = defaultMenu('admin_header')
  const items = menu.categories.flatMap(allItems)
  const find = (href: string) => items.find((i) => i.href === href)!

  it('has seven sections, in the consolidated order', () => {
    expect(menu.categories.map((c) => c.label)).toEqual(['Overview', 'Community', 'Content', 'Growth', 'Resonance CRM', 'Vera AI', 'Platform'])
  })

  it('lists every destination once (one canonical place per function)', () => {
    const hrefs = items.map((i) => i.href)
    expect(hrefs.length).toBe(new Set(hrefs).size)
  })

  it('reaches every operator leaf (the CRM roster is the CRM landing itself)', () => {
    const hrefs = new Set(items.map((i) => i.href))
    expect(STUDIO_LEAVES.filter((l) => !hrefs.has(l.href)).map((l) => l.id)).toEqual([])
  })

  it('gates a merged-in tool by its own page, never its new section', () => {
    expect([find('/admin/qr').minAccess, find('/admin/qr').staffDomain]).toEqual(['admin', 'qr'])
    expect([find('/admin/marketplace').minAccess, find('/admin/marketplace').staffDomain]).toEqual(['admin', 'platform'])
    // A FROZEN_GATE_DEBT row carries its PAGE's gate, so the menu never promises what the page denies.
    expect([find('/admin/crm/pipeline').minAccess, find('/admin/crm/pipeline').staffDomain]).toEqual(['janitor', undefined])
    // Member Roster was stamped host + community by its section, a dead link for every host.
    expect([find('/admin/members').minAccess, find('/admin/members').staffDomain]).toEqual(['janitor', 'members'])
  })
})
