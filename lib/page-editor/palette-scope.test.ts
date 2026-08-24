import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { config } from '@/lib/page-editor/config'
import {
  SURFACE_CATEGORIES,
  categoryKeysForSurface,
  type EditorSurface,
} from '@/lib/page-editor/palette-scope'
import { derivePickerGroups } from '@/components/page-editor/mobile/data-ops'

// ─────────────────────────────────────────────────────────────────────────────
// THE GATE FOR PER-SURFACE PALETTE SCOPE (LIVE-068).
//
// It is deliberately written to fail if the scoping is REMOVED or BYPASSED, not merely if
// palette-scope.ts stops existing — a "grep the words in the title" probe is the shape-not-truth
// failure this repo names in four ADRs. Each block below states the mutation it catches:
//
//   1. derivePickerGroups ignores its `surface` argument      → §"scopes the palette"
//   2. a scoped-out category is re-offered via the "More" group → §"never reappears under More"
//   3. an editor drops the argument at its call site           → §"both editors pass a surface"
//   4. a new library category quietly joins every surface       → §"the allowlist covers the library"
//   5. the fail-safe flips from open to closed (empty palette)  → §"fails OPEN, never empty"
//
// It runs against the REAL config (87 components, 11 categories), not a fixture, so a config
// edit that changes what a surface can bind shows up here.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACES = Object.keys(SURFACE_CATEGORIES) as EditorSurface[]
const configCategoryKeys = Object.keys(config.categories ?? {})
const groupKeys = (surface?: EditorSurface) =>
  derivePickerGroups(config, undefined, surface).map((g) => g.key)
const offeredTypes = (surface?: EditorSurface) =>
  new Set(derivePickerGroups(config, undefined, surface).flatMap((g) => g.items.map((i) => i.type)))

/** The Space-bound categories, named here rather than read back out of SURFACE_CATEGORIES: a test
 *  that derives its expectation from the thing under test passes by tautology. These are the three
 *  the 2026-08-24 measurement showed render nothing (or an empty wrapper) with no `metadata.space`. */
const SPACE_ONLY = ['profile', 'spaceContent', 'linkTree'] as const
/** Likewise the Circles index set, which binds only where `metadata.circlesIndex` is injected. */
const CIRCLES_ONLY = 'circles'

describe('the palette scopes to the surface', () => {
  it('drops the Space-only categories from a marketing page', () => {
    const keys = groupKeys('marketing')
    for (const cat of SPACE_ONLY) expect(keys, `marketing still offers "${cat}"`).not.toContain(cat)
    expect(keys).toContain('sections')
    expect(keys).toContain(CIRCLES_ONLY)
  })

  it('keeps them on a Space page, and drops the Circles index set instead', () => {
    const keys = groupKeys('space')
    for (const cat of SPACE_ONLY) expect(keys, `space lost "${cat}"`).toContain(cat)
    expect(keys).not.toContain(CIRCLES_ONLY)
  })

  it('actually withholds the blocks, not just the group headings', () => {
    const marketing = offeredTypes('marketing')
    const space = offeredTypes('space')
    // SpaceAbout + SpaceReviews are the two categories' primary blocks; LinkTree is the link-tree root.
    for (const type of ['SpaceAbout', 'SpaceReviews', 'LinkTree']) {
      expect(marketing.has(type), `marketing still offers ${type}`).toBe(false)
      expect(space.has(type), `space lost ${type}`).toBe(true)
    }
    // And the generic kit survives on both, so this is a scope, not a blanket ban.
    for (const type of ['Hero', 'Heading', 'PhotoHero', 'Image']) {
      expect(marketing.has(type)).toBe(true)
      expect(space.has(type)).toBe(true)
    }
  })

  it('is a real narrowing — every surface offers strictly fewer blocks than the whole library', () => {
    const everything = offeredTypes(undefined)
    for (const surface of SURFACES) {
      const scoped = offeredTypes(surface)
      expect(scoped.size, `${surface} is not scoped at all`).toBeLessThan(everything.size)
    }
  })
})

describe('a scoped-out block never reappears under "More"', () => {
  // The subtle bug this catches: "placed" is accumulated per EMITTED group. Mark a block placed only
  // when its group is offered, and every scoped-out block falls through to the uncategorized "More"
  // bucket — the palette looks scoped while offering the whole Space set back on a marketing page.
  it('offers no Space profile block anywhere in a marketing palette', () => {
    const spaceBlocks = SPACE_ONLY.flatMap(
      (cat) =>
        ((config.categories ?? {}) as Record<string, { components?: readonly string[] }>)[cat]
          ?.components ?? [],
    )
    expect(spaceBlocks.length).toBeGreaterThan(20)
    const marketing = offeredTypes('marketing')
    const leaked = spaceBlocks.filter((t) => marketing.has(t))
    expect(leaked, `these leaked into the marketing palette: ${leaked.join(', ')}`).toEqual([])
  })

  it('still offers the uncategorized blocks, which no surface claims', () => {
    // FAIL-OPEN, PINNED. An uncategorized component belongs to no surface, so hiding it would make it
    // unreachable everywhere. It stays offered — and this list is pinned so a NEW orphan is noticed
    // here rather than quietly leaking onto every surface. If this fails, categorize the new block in
    // lib/page-editor/config.tsx (preferred) or add it to this list on purpose.
    const placed = new Set(
      Object.values((config.categories ?? {}) as Record<string, { components?: readonly string[] }>)
        .flatMap((c) => c.components ?? []),
    )
    const orphans = Object.keys(config.components).filter((t) => !placed.has(t))
    expect(orphans.sort()).toEqual(['DisplayHeading', 'Prose', 'SpaceArrangement'])
    for (const surface of SURFACES) expect(groupKeys(surface)).toContain('__other')
  })
})

describe('both editors pass a surface', () => {
  // Source-shape, because the alternative is mounting two React editors just to observe an argument.
  // Comment lines are stripped so a PROSE mention of the argument cannot satisfy the guard.
  const code = (rel: string) =>
    readFileSync(resolve(process.cwd(), rel), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')

  it('threads the surface into derivePickerGroups on the desktop path', () => {
    expect(code('components/page-editor/desktop/desktop-editor.tsx')).toContain(
      'derivePickerGroups(config, data, surface)',
    )
  })

  it('threads the surface into derivePickerGroups on the mobile path', () => {
    expect(code('components/page-editor/mobile/mobile-editor.tsx')).toContain(
      'derivePickerGroups(config, data, surface)',
    )
  })

  it('declares surface as a REQUIRED prop on both editors, so a new mount cannot omit it', () => {
    for (const rel of [
      'components/page-editor/desktop/desktop-editor.tsx',
      'components/page-editor/mobile/mobile-editor.tsx',
    ]) {
      // `surface: EditorSurface` — no `?`, which is what makes tsc the gate for a forgotten mount.
      expect(code(rel), `${rel} made surface optional`).toMatch(/\n\s*surface: EditorSurface\b/)
    }
  })

  it('names a real surface at both mount sites', () => {
    expect(code('components/page-editor/editor.tsx')).toContain('surface="marketing"')
    expect(code('components/page-editor/editor.tsx')).toContain("surface: 'marketing'")
    expect(code('components/spaces/space-landing-editor.tsx')).toContain('surface="space"')
    expect(code('components/spaces/space-landing-editor.tsx')).toContain("surface: 'space'")
  })
})

describe('the allowlist covers the library', () => {
  it('places every config category on at least one surface, and invents none', () => {
    const claimed = new Set(SURFACES.flatMap((s) => SURFACE_CATEGORIES[s]))
    // A category in the library that no surface claims would silently vanish from every palette.
    expect([...configCategoryKeys].sort()).toEqual([...claimed].sort())
  })

  it('gives every surface a non-empty allowlist', () => {
    for (const surface of SURFACES) {
      expect(SURFACE_CATEGORIES[surface].length, `${surface} has no categories`).toBeGreaterThan(0)
    }
  })
})

describe('the fail-safe opens, it never empties', () => {
  it('offers the whole library when no surface is given', () => {
    expect(groupKeys(undefined).sort()).toEqual([...configCategoryKeys, '__other'].sort())
  })

  it('offers the whole library for a surface this build does not recognise', () => {
    // Only reachable past the type system (a cast, or a value crossing a serialization boundary).
    // An over-wide palette is cosmetic; an EMPTY one is an editor that cannot author anything.
    const rogue = 'someFutureSurface' as EditorSurface
    expect(categoryKeysForSurface(rogue)).toBeNull()
    expect(offeredTypes(rogue).size).toBe(Object.keys(config.components).length)
  })

  it('never hands any surface an empty palette', () => {
    for (const surface of [...SURFACES, 'someFutureSurface' as EditorSurface, undefined]) {
      expect(offeredTypes(surface).size, `${surface} palette is empty`).toBeGreaterThan(0)
    }
  })
})
