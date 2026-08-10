import { describe, expect, it } from 'vitest'

import { applyRegistryGates, registryGateFor, normalizeGateHref, REGISTRY_GATES } from './gates'
import { defaultMenu } from './defaults'
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

// ── Loom Studio is its own admin_header section, and the gate is the reason (ADR-979) ────────────
// /admin/library matched NO section, so its sub-nav band drew empty. The fix could not be "file it
// under an existing section", because adminHeaderMenu() stamps the SECTION's min + staffDomain onto
// every item in it: Growth (host + marketing) would have offered a janitor-only tool to hosts, and
// Operations (janitor + platform) would have dropped it for a marketing-domain janitor.
describe('Loom Studio section (ADR-979)', () => {
  const menu = defaultMenu('admin_header')
  const section = menu.categories.find((c) => c.items.some((i) => i.href === '/admin/library'))

  it('resolves to a section at all, so the sub-nav band is not empty', () => {
    expect(section, '/admin/library must match an admin_header section').toBeDefined()
  })

  it('carries its OWN gate rather than inheriting a neighbour\'s', () => {
    // BOTH halves, and the second one is here because the first version of this test only checked
    // staffDomain: flipping `min: janitor` to `admin` in the spec left all 23 tests green. A gate
    // assertion that only covers one axis is a gate assertion that misses half the ways it breaks.
    //
    //   staffDomain 'platform' -> someone filed it under Operations, and a marketing-domain
    //                             janitor silently lost the tab.
    //   minAccess  'host'      -> someone filed it under Growth, and it is now offered to hosts.
    const item = section!.items.find((i) => i.href === '/admin/library')!
    expect(item.staffDomain).toBe('marketing')
    expect(item.minAccess).toBe('janitor')
  })

  it('does not drag another section\'s leaves in with it', () => {
    // No `groups` on the spec, so the band shows only its own landing link.
    expect(section!.children).toHaveLength(0)
  })
})
