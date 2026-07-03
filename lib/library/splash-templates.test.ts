import { describe, it, expect } from 'vitest'
import { SPLASH_TEMPLATES, listSplashTemplates, splashTemplateById, splashUsageHref } from './splash-templates'
import { LIBRARY_KINDS } from './types'

// Locks the seeded splash-template catalog that the Loom Studio Splash lane CATALOGS
// (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10). The registry (splash-registry.ts) is
// server-only + DB-backed, so its pure catalog source is what we assert here.

describe('splash template catalog', () => {
  it('lists at least one template and exposes it via the read helper', () => {
    expect(SPLASH_TEMPLATES.length).toBeGreaterThan(0)
    expect(listSplashTemplates()).toEqual(SPLASH_TEMPLATES)
  })

  it('every template uses a reserved template/flow Loom kind and the splash category', () => {
    for (const t of SPLASH_TEMPLATES) {
      expect(['template', 'flow']).toContain(t.kind)
      expect(LIBRARY_KINDS).toContain(t.kind)
      expect(t.category).toBe('splash')
    }
  })

  it('ids are unique and resolvable', () => {
    const ids = SPLASH_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of SPLASH_TEMPLATES) expect(splashTemplateById(t.id)).toBe(t)
    expect(splashTemplateById('does-not-exist')).toBeNull()
  })

  it('🔴 §10: every template DEEP-LINKS OUT to a real editor (never edits in the Loom)', () => {
    for (const t of SPLASH_TEMPLATES) {
      // A compose deep-link that leaves the Loom Studio (Puck editor at /edit/*, or the QR studio).
      expect(t.composeHref).toMatch(/^\/(edit\/[a-z-]+|admin\/qr)$/)
      // It must NOT try to compose the splash inside the Loom library lane.
      expect(t.composeHref.startsWith('/admin/library')).toBe(false)
      expect(t.composeLabel.length).toBeGreaterThan(0)
    }
  })

  it('voice canon (CONTENT-VOICE §10): no em/en dashes in any label or copy', () => {
    for (const t of SPLASH_TEMPLATES) {
      for (const s of [t.title, t.description, t.composeLabel]) {
        expect(s).not.toMatch(/[—–]/)
      }
    }
  })
})

describe('splashUsageHref (the "Used in" deep-link OUT)', () => {
  it('a page usage deep-links OUT to the Puck micro-site editor at /edit/<slug>', () => {
    expect(splashUsageHref('page', 'home')).toBe('/edit/home')
    expect(splashUsageHref('page', 'spaces')).toBe('/edit/spaces')
  })

  it('🔴 §10: the deep-link never targets inside the Loom library lane', () => {
    const href = splashUsageHref('page', 'home')
    expect(href?.startsWith('/admin/library')).toBe(false)
  })

  it('a null ref_id has no target', () => {
    expect(splashUsageHref('page', null)).toBeNull()
  })

  it('contexts with no single splash editor route resolve to null (rendered as plain text)', () => {
    expect(splashUsageHref('space_brand', 'abc')).toBeNull()
    expect(splashUsageHref('spotlight', 'abc')).toBeNull()
    expect(splashUsageHref('email', 'abc')).toBeNull()
    expect(splashUsageHref('other', 'abc')).toBeNull()
  })
})
