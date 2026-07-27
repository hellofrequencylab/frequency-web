import { describe, it, expect } from 'vitest'
import {
  ADMIN_BOX_HREFS,
  ADMIN_PARENT_BY_HREF,
  adminParentHref,
  nestAdminRows,
  normalizeAdminHref,
} from './admin-nesting'
import { STUDIO_LEAVES, STUDIO_WORLDS } from './studio'

// The operator Admin rail's box shape (ADR-848). The point of these is that NOTHING is hand-listed:
// every parent below is the `world` the destination's own StudioLeaf already declares, so if a leaf
// is re-homed in studio.ts these expectations move with it rather than going stale.

/** The thirteen rows the live rail renders today, in their live DB order. */
const LIVE_ADMIN_ROWS = [
  '/admin',
  '/lead',
  '/admin/programs',
  '/admin/growth',
  '/admin/community',
  '/admin/crm',
  '/admin/marketplace',
  '/admin/spaces',
  '/admin/business-seeder',
  '/admin/vera-ai',
  '/admin/operations',
  '/admin/qr',
  '/admin/library',
].map((href) => ({ href }))

describe('the boxes are the studio worlds, not a second list', () => {
  it('has one box per world landing page', () => {
    expect(ADMIN_BOX_HREFS.size).toBe(STUDIO_WORLDS.length)
    for (const w of STUDIO_WORLDS) {
      expect(ADMIN_BOX_HREFS.has(normalizeAdminHref(w.href))).toBe(true)
    }
  })

  it('never nests one box under another', () => {
    for (const child of ADMIN_PARENT_BY_HREF.keys()) {
      expect(ADMIN_BOX_HREFS.has(child)).toBe(false)
    }
  })

  it('every parent it names is a real box', () => {
    for (const parent of ADMIN_PARENT_BY_HREF.values()) {
      expect(ADMIN_BOX_HREFS.has(parent)).toBe(true)
    }
  })

  it('agrees with the world each leaf declares, for every world-tagged leaf', () => {
    const worldHref = new Map(STUDIO_WORLDS.map((w) => [w.key, normalizeAdminHref(w.href)]))
    for (const leaf of STUDIO_LEAVES) {
      if (!leaf.world) continue
      const child = normalizeAdminHref(leaf.href)
      const expected = worldHref.get(leaf.world)
      if (!expected || child === expected || ADMIN_BOX_HREFS.has(child)) continue
      // First declaration wins on a normalized collision, so only assert the mapping exists and
      // points at SOME world's page; the specific winner is studio.ts declaration order.
      expect(ADMIN_PARENT_BY_HREF.has(child)).toBe(true)
    }
  })
})

describe('the thirteen live rows collapse to six boxes', () => {
  const nested = nestAdminRows(LIVE_ADMIN_ROWS)
  const boxes = nested.filter((r) => r.depth === 0).map((r) => r.href)
  const childrenOf = (parent: string) => {
    const i = nested.findIndex((r) => r.href === parent)
    const out: string[] = []
    for (let j = i + 1; j < nested.length && nested[j].depth === 1; j++) out.push(nested[j].href)
    return out
  }

  it('leaves exactly six top-level rows', () => {
    expect(boxes).toEqual([
      '/admin', // Dashboard - the overview world
      '/lead', // Leadership - no world, so it stays a box of its own
      '/admin/programs', // Programs - the content world
      '/admin/growth', // Growth
      '/admin/community', // Community
      '/admin/operations', // Operations - the platform world
    ])
  })

  it('files QR Studio and the Resonance CRM under Growth', () => {
    expect(childrenOf('/admin/growth')).toEqual(['/admin/crm', '/admin/qr'])
  })

  it('files Loom Studio under Programs', () => {
    expect(childrenOf('/admin/programs')).toEqual(['/admin/library'])
  })

  it('files the platform tools under Operations, including a row that is DB-only', () => {
    // Business Seeder is not a NAV_AREAS entry at all - it exists only as a menu_items row. It
    // nests anyway because the map is keyed by href, which the DB row and the leaf share.
    expect(childrenOf('/admin/operations')).toEqual([
      '/admin/marketplace',
      '/admin/spaces',
      '/admin/business-seeder',
      '/admin/vera-ai',
    ])
  })

  it('keeps Leadership top-level, since no leaf claims /lead for a world', () => {
    expect(adminParentHref('/lead')).toBeNull()
  })

  it('never drops or duplicates a row', () => {
    expect(nested).toHaveLength(LIVE_ADMIN_ROWS.length)
    expect(new Set(nested.map((r) => r.href)).size).toBe(LIVE_ADMIN_ROWS.length)
  })
})

describe('fail-safe: a child never disappears with its box', () => {
  it('keeps a child at depth 0 when its box was gated away', () => {
    // The Admin section telescopes, so a viewer who cannot reach /admin/operations never gets that
    // row. Their Manage Spaces row must still render, flat, rather than vanishing with the parent.
    const rows = [{ href: '/admin' }, { href: '/admin/spaces' }, { href: '/admin/vera-ai' }]
    const nested = nestAdminRows(rows)
    expect(nested).toEqual([
      { href: '/admin', depth: 0 },
      { href: '/admin/spaces', depth: 0 },
      { href: '/admin/vera-ai', depth: 0 },
    ])
  })

  it('nests only the children whose box survived the gate', () => {
    const rows = [{ href: '/admin/growth' }, { href: '/admin/qr' }, { href: '/admin/spaces' }]
    expect(nestAdminRows(rows)).toEqual([
      { href: '/admin/growth', depth: 0 },
      { href: '/admin/qr', depth: 1 },
      { href: '/admin/spaces', depth: 0 },
    ])
  })

  it('is a permutation of its input for any subset of the live rows', () => {
    for (let i = 0; i < LIVE_ADMIN_ROWS.length; i++) {
      const subset = LIVE_ADMIN_ROWS.filter((_, j) => j !== i)
      const nested = nestAdminRows(subset)
      expect(nested.map((r) => r.href).sort()).toEqual(subset.map((r) => r.href).sort())
    }
  })

  it('handles an empty rail', () => {
    expect(nestAdminRows([])).toEqual([])
  })

  it('carries the row through untouched apart from depth', () => {
    const rows = [{ href: '/admin/growth', label: 'Growth' }, { href: '/admin/qr', label: 'QR Studio' }]
    expect(nestAdminRows(rows)).toEqual([
      { href: '/admin/growth', label: 'Growth', depth: 0 },
      { href: '/admin/qr', label: 'QR Studio', depth: 1 },
    ])
  })
})

describe('href normalization', () => {
  it('nests a bare page under the same box as its tabbed leaf', () => {
    // studio.ts declares /admin/vera-ai?tab=vera; the rail row is the bare page.
    expect(adminParentHref('/admin/vera-ai')).toBe('/admin/operations')
    expect(adminParentHref('/admin/vera-ai?tab=vera')).toBe('/admin/operations')
  })

  it('strips a fragment and a trailing slash', () => {
    expect(normalizeAdminHref('/admin/qr#scans')).toBe('/admin/qr')
    expect(normalizeAdminHref('/admin/qr/')).toBe('/admin/qr')
    expect(normalizeAdminHref('/')).toBe('/')
  })

  it('has no parent for an href no leaf declares', () => {
    expect(adminParentHref('/feed')).toBeNull()
    expect(adminParentHref('/admin/not-a-real-page')).toBeNull()
  })
})
