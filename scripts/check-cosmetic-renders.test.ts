import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CENSUS_PATH,
  REGISTRY_PATH,
  INDETERMINATE,
  RENDER_REQUIRED_CATEGORIES as GUARD_CATEGORIES,
  loadCensus,
  extractRegistry,
  normalizeBorderValue as guardNormalize,
  resolvesToRender,
  renderRequired,
  integrityProblems,
  classify,
  report,
} from './check-cosmetic-renders.mjs'
import {
  BORDER_RENDERS,
  FLAIR_RENDERS,
  SLUG_COSMETICS,
  MAX_TITLE_LENGTH,
  RENDER_REQUIRED_CATEGORIES,
  normalizeBorderValue,
  isRenderableCosmetic,
  isUndeliverable,
  cosmeticForItem,
} from '@/lib/store/cosmetics'

// THE ENFORCING HALF of check:cosmetic-renders (backlog LIVE-013). The .mjs owns the census I/O,
// the integrity floors and the pure classifier; it can only PARSE the render registry, because the
// registry is TypeScript and bare node cannot import it. This file closes that gap two ways:
//
//   1. It imports the LIVE registry and asserts the parser agrees with it EXACTLY. A parser that
//      silently drifts is worse than no parser — it prints ✓ over a shelf nothing paints. The
//      first run of this guard did exactly that (it parsed the `Record<string, { icon: … }>` type
//      annotation instead of the value and declared all five flair SKUs broken), which is why the
//      cross-check is a test and not a comment.
//   2. It drives the classifier against BROKEN FIXTURES, so the detector is proven to fire rather
//      than assumed to. A guard that has never been seen to fail is not evidence of anything.

const census = loadCensus(CENSUS_PATH)
const parsed = extractRegistry(readFileSync(REGISTRY_PATH, 'utf8'))

/** The live registry, in the shape the pure guard consumes. */
const live = {
  borders: new Set(Object.keys(BORDER_RENDERS)),
  flairs: new Set(Object.keys(FLAIR_RENDERS)),
  bridged: new Set(Object.keys(SLUG_COSMETICS)),
  maxTitleLength: MAX_TITLE_LENGTH,
}

describe('check:cosmetic-renders — the parser agrees with the live registry', () => {
  it('extracts the registry at all', () => {
    expect(parsed).not.toBeNull()
  })

  it('extracts exactly the border, flair and bridged vocabularies the module exports', () => {
    // Narrowed here rather than asserted per line: the sibling test above proves it parses, and a
    // non-null assertion on each line would hide a genuine null behind four separate `!`s.
    if (parsed === null) throw new Error('the registry did not parse — see the sibling test')
    expect([...parsed.borders].sort()).toEqual([...live.borders].sort())
    expect([...parsed.flairs].sort()).toEqual([...live.flairs].sort())
    expect([...parsed.bridged].sort()).toEqual([...live.bridged].sort())
    expect(parsed.maxTitleLength).toBe(MAX_TITLE_LENGTH)
  })

  it('agrees with the module on the categories that owe a render', () => {
    expect([...GUARD_CATEGORIES].sort()).toEqual([...RENDER_REQUIRED_CATEGORIES].sort())
  })

  it('normalises border values the same way the module does, for every value on the live shelf', () => {
    const values = census.shelf
      .map((i: { metadata?: { type?: string; value?: string } }) => (i.metadata?.type === 'border' ? i.metadata.value : null))
      .filter((v: string | null): v is string => typeof v === 'string')
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) expect(guardNormalize(v)).toBe(normalizeBorderValue(v))
  })

  it('reaches the same verdict as the module on every purchasable cosmetic/title SKU', () => {
    const scoped = renderRequired(census)
    expect(scoped.length).toBeGreaterThan(0)
    for (const item of scoped) {
      expect(resolvesToRender(item, live)).toBe(!isUndeliverable(item))
    }
  })
})

describe('the render registry itself', () => {
  it('paints every value it claims to know', () => {
    for (const value of Object.keys(BORDER_RENDERS)) expect(isRenderableCosmetic('border', value)).toBe(true)
    for (const value of Object.keys(FLAIR_RENDERS)) expect(isRenderableCosmetic('flair', value)).toBe(true)
  })

  it('only bridges a slug to a cosmetic it can actually paint', () => {
    // The bridge exists to rescue a SKU whose metadata never got a type. A bridge entry that
    // resolves to nothing would be the original bug wearing a different hat.
    for (const [slug, spec] of Object.entries(SLUG_COSMETICS)) {
      expect(isRenderableCosmetic(spec.type, spec.value), slug).toBe(true)
      expect(cosmeticForItem({ slug, metadata: {} })).toEqual(spec)
    }
  })

  it('lets applied metadata beat the bridge', () => {
    const [slug] = Object.keys(SLUG_COSMETICS)
    expect(cosmeticForItem({ slug, metadata: { type: 'title', value: 'Legend' } })).toEqual({
      type: 'title',
      value: 'Legend',
    })
  })
})

describe('the live shelf', () => {
  it('has no UNDECLARED gap, and no rotted quarantine entry', () => {
    const v = classify(census, live)
    expect(v.integrity).toEqual([])
    expect(v.undeclared).toEqual([])
    expect(v.staleQuarantine).toEqual([])
    expect(v.incompleteQuarantine).toEqual([])
  })

  it('still carries the four declared, un-deliverable SKUs (so this suite is not passing on an empty set)', () => {
    // ⚠️ NON-VACUITY, on the real corpus. If this drops to zero because the owner applied the
    // proposal SQL and re-captured, DELETE the quarantine entries and this expectation together —
    // `staleQuarantine` above will already be failing to remind you.
    const v = classify(census, live)
    expect(v.quarantined).toEqual(['animated-banner', 'callsign-plate', 'custom-title-slot', 's1-flair-set'])
  })
})

// ── THE DETECTOR IS PROVEN TO FIRE ──────────────────────────────────────────────────────────────
// Every fixture below is a shelf that SHOULD be refused. If the guard ever goes quiet on these, it
// has stopped measuring anything, and its ✓ on the real shelf means nothing.

/** A minimal census that clears the integrity floors, so a fixture fails for its OWN reason and
 *  not because it tripped a floor. */
function fixtureCensus(extra: Record<string, unknown>[] = [], quarantine: Record<string, unknown>[] = []) {
  const filler = Array.from({ length: 14 }, (_, n) => ({
    slug: `filler-title-${n}`,
    category: 'title',
    gem_cost: 100,
    is_active: true,
    metadata: { type: 'title', value: `Filler ${n}` },
  }))
  const perks = Array.from({ length: 8 }, (_, n) => ({
    slug: `filler-perk-${n}`,
    category: 'feature',
    gem_cost: 100,
    is_active: true,
    metadata: {},
  }))
  return { capturedAt: '2026-08-17', shelf: [...filler, ...perks, ...extra], quarantine }
}

describe('non-vacuity — the guard fires on a shelf that should be refused', () => {
  it('FAILS an undeclared cosmetic whose value nothing paints', () => {
    const c = fixtureCensus([
      { slug: 'border-aurora', category: 'cosmetic', gem_cost: 900, is_active: true, metadata: { type: 'border', value: 'ring-aurora-500' } },
    ])
    const v = classify(c, live)
    expect(v.undeclared).toEqual(['border-aurora'])
    expect(report(c, live).code).toBe(1)
  })

  it('FAILS an undeclared cosmetic/title SKU with empty metadata (the metadata `{}` hole)', () => {
    const c = fixtureCensus([
      { slug: 'mystery-plate', category: 'cosmetic', gem_cost: 300, is_active: true, metadata: {} },
      { slug: 'mystery-title', category: 'title', gem_cost: 200, is_active: true, metadata: {} },
    ])
    expect(classify(c, live).undeclared).toEqual(['mystery-plate', 'mystery-title'])
    expect(report(c, live).code).toBe(1)
  })

  it('FAILS a quarantine entry that has rotted (the SKU now renders)', () => {
    const c = fixtureCensus(
      [{ slug: 'border-indigo', category: 'cosmetic', gem_cost: 250, is_active: true, metadata: { type: 'border', value: 'ring-indigo-500' } }],
      [{ slug: 'border-indigo', reason: 'used to be broken', resolution: 'deactivate' }],
    )
    expect(classify(c, live).staleQuarantine).toEqual(['border-indigo'])
    expect(report(c, live).code).toBe(1)
  })

  it('FAILS a quarantine entry with no reason or no resolution', () => {
    const c = fixtureCensus(
      [{ slug: 'mystery-plate', category: 'cosmetic', gem_cost: 300, is_active: true, metadata: {} }],
      [{ slug: 'mystery-plate' }],
    )
    expect(classify(c, live).incompleteQuarantine).toEqual(['mystery-plate'])
    expect(report(c, live).code).toBe(1)
  })

  it('is INDETERMINATE (79), never green, on an emptied census', () => {
    const empty = { capturedAt: '2026-08-17', shelf: [], quarantine: [] }
    expect(integrityProblems(empty).length).toBeGreaterThan(0)
    expect(report(empty, live).code).toBe(INDETERMINATE)
  })

  it('is INDETERMINATE, never green, when the registry cannot be parsed', () => {
    expect(extractRegistry('export const NOTHING = 1')).toBeNull()
    expect(extractRegistry('')).toBeNull()
  })

  it('does NOT fire on the exempt categories (a perk is honored by a person, a collectible is a chip)', () => {
    const c = fixtureCensus([
      { slug: 'a-seat', category: 'feature', gem_cost: 250, is_active: true, metadata: {} },
      { slug: 'a-pass', category: 'membership', gem_cost: 150, is_active: true, metadata: {} },
      { slug: 'a-badge', category: 'collectible', gem_cost: 100, is_active: true, metadata: {} },
    ])
    expect(classify(c, live).undeclared).toEqual([])
  })

  it('does NOT fire on a granted or retired cosmetic (not purchasable)', () => {
    const c = fixtureCensus([
      { slug: 'rank-ghost-flair', category: 'cosmetic', gem_cost: 0, is_active: false, metadata: { granted: true } },
      { slug: 'certificate-seal', category: 'cosmetic', gem_cost: 0, is_active: true, metadata: { grant_only: true } },
      { slug: 'retired-border', category: 'cosmetic', gem_cost: 400, is_active: false, metadata: {} },
    ])
    expect(classify(c, live).undeclared).toEqual([])
  })
})

describe('the probe answers the row, not the gate', () => {
  it('says NOT DONE while any purchasable SKU is undeliverable, declared or not', () => {
    expect(report(census, live, { probe: true }).code).toBe(1)
  })

  it('says DONE only when nothing is left', () => {
    const clean = fixtureCensus()
    expect(report(clean, live, { probe: true }).code).toBe(0)
  })

  it('says INDETERMINATE on a census it cannot trust', () => {
    expect(report({ capturedAt: '', shelf: [], quarantine: [] }, live, { probe: true }).code).toBe(INDETERMINATE)
  })
})
