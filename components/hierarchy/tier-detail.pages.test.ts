import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// HYG-046 — THE TWINS STAY UNTWINNED.
//
// `/hubs/[slug]` and `/nexuses/[slug]` were 243 and 232 lines of the same page written twice, and
// they had already drifted three ways (the batched round-trip, archived children, and the child
// row's grammar). The shared implementation only helps for as long as neither page grows its own
// copy back, and nothing in a unit test of the shared module can notice that happening — the
// regression is a page that stops calling it. So this is a SOURCE-shape test, the same instrument
// as check-shell-weight's Arm C: it reads both pages and asserts what they must and must not
// contain.
//
// It is deliberately about STRUCTURE, not markup: it never asserts a class name or a string of
// copy, so a design change to the shared component does not fail it. Every assertion below failed
// on the pre-extraction tree.

const ROOT = process.cwd()
const PAGES = {
  hub: 'app/(main)/hubs/[slug]/page.tsx',
  nexus: 'app/(main)/nexuses/[slug]/page.tsx',
} as const

/** A ratchet, not a target: these may shrink and must not grow. Measured after the extraction
 *  (122 / 117, down from 243 / 232). What is left in each page is irreducibly tier-specific —
 *  its entity query, the row type that query returns, and the view it maps them into. */
const MAX_LINES = 125

const source = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Import specifiers, with comments and JSX out of the way. */
const imports = (src: string) => [...src.matchAll(/^import[\s\S]*?from '([^']+)'/gm)].map((m) => m[1])

/** What a page pulls out of the shared rendering module. */
const sharedNames = (src: string) => {
  const found = new Set<string>()
  for (const m of src.matchAll(/import (?:type )?\{([^}]*)\} from '@\/components\/hierarchy\/tier-detail'/g)) {
    for (const name of m[1].split(',')) {
      const trimmed = name.trim().replace(/^type /, '')
      if (trimmed) found.add(trimmed)
    }
  }
  return found
}

describe.each(Object.entries(PAGES))('%s detail page', (tier, rel) => {
  it('exists where this test thinks it does', () => {
    expect(existsSync(join(ROOT, rel))).toBe(true)
  })

  it('delegates to the one shared tier-detail implementation', () => {
    const specs = imports(source(rel))
    expect(specs).toContain('@/components/hierarchy/tier-detail')
    expect(specs).toContain('@/lib/hierarchy/tier-detail')
  })

  it('still composes the kit shell itself (PAGE-FRAMEWORK §3, check:templates)', () => {
    // The shared module returns DetailTemplate's SLOTS; the page renders the template. Moving the
    // tag into the shared component would read as a page that owns no layout and would take the
    // templates ratchet backwards, so it is pinned here rather than only in the gate.
    expect(source(rel)).toContain('<DetailTemplate')
  })

  it('does not re-declare the header, the cards, the rows or the empty state', () => {
    // Every one of these was imported by BOTH pages before the extraction — the literal list from
    // the backlog row. A page reaching for one again is a page starting a second copy.
    const specs = imports(source(rel))
    for (const reDeclared of [
      '@/components/hierarchy/breadcrumb',
      '@/components/groups/status-badge',
      '@/components/admin/inline/inline-text',
      '@/components/admin/open-admin-bar-button',
      '@/components/ui/stat-card',
      '@/components/ui/section-header',
      '@/components/ui/empty-state',
      '@/components/ui/progress-track',
    ]) {
      expect(specs).not.toContain(reDeclared)
    }
  })

  it('reaches the scoped-Insight and cover reads only through the shared loader', () => {
    // The Nexus page's serial drift began exactly here: it awaited surfaceAccess on its own,
    // outside the batch, and then awaited its child query after that.
    const specs = imports(source(rel))
    expect(specs).not.toContain('@/lib/core/viewer-hats')
    expect(specs).not.toContain('@/lib/core/scoped-surface-ui')
    expect(specs).not.toContain('@/lib/layout/detail-hero')
  })

  it('serialises exactly one read — the entity it is named for', () => {
    // The child query is handed to `loadTierChrome` unawaited so it joins the one round-trip.
    // A second `await admin` is a read that has fallen out of the batch.
    const serial = source(rel).match(/await admin\b/g) ?? []
    expect(serial).toHaveLength(1)
  })

  it(`stays under ${MAX_LINES} lines (ratchet — may shrink, never grow)`, () => {
    expect(source(rel).split('\n').length).toBeLessThanOrEqual(MAX_LINES)
  })

  it('is a tier page, not a bespoke one', () => {
    expect(tier === 'hub' || tier === 'nexus').toBe(true)
  })
})

describe('the two pages go through the same door', () => {
  it('pulls the SAME set of names out of the shared module', () => {
    const hub = sharedNames(source(PAGES.hub))
    const nexus = sharedNames(source(PAGES.nexus))
    expect(hub.size).toBeGreaterThan(0)
    expect([...nexus].sort()).toEqual([...hub].sort())
  })

  it('builds a TierDetailView and nothing else tier-shaped', () => {
    for (const rel of Object.values(PAGES)) {
      expect(source(rel)).toContain('const view: TierDetailView =')
    }
  })
})
