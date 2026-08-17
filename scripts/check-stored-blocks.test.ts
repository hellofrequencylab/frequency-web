import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CENSUS_PATH,
  INDETERMINATE,
  MIN_STORES,
  MIN_DOCUMENTS,
  MIN_TYPES,
  loadCensus,
  censusTypes,
  integrityProblems,
  classify,
  mapsTypeToSuccessor,
  report,
} from './check-stored-blocks.mjs'
import { config } from '@/lib/page-editor/config'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ENFORCING HALF of check:stored-blocks (ADR-1055, backlog LIVE-028, ADR-977 D-9).
//
// scripts/check-stored-blocks.mjs is pure node and cannot read a TSX registry. This file can, so
// this is where "every type in stored page data resolves to a real block" is actually asserted —
// against the LIVE `config.components`, not a copy of it. Two halves, one classifier, so they
// cannot disagree about what an orphan is.
//
// ⚠️ HALF OF THIS FILE IS THE NON-VACUITY PROOF, and that is deliberate. A guard that has never
// been seen to FAIL is a guard nobody has tested — this repo's own history is a list of gates
// that were green because they were measuring nothing (check:og-trace anchored to a filename,
// the `check:menu` naming convention, the ripgrep probes that inverted on CI). So every arm below
// is driven twice: once against the real tree, and once against a fixture built to break it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..')
const REGISTRY_TYPES = Object.keys(config.components)
const census = loadCensus(join(ROOT, CENSUS_PATH))

type TypeCounts = Record<string, { blocks: number; docs: number }>
type StoreRow = { store?: string; documents?: number; types?: TypeCounts }
type QuarantineRow = { type: string; successor?: string; migration?: string }
type Census = { capturedAt?: string; stores: StoreRow[]; quarantine: QuarantineRow[] }

/** A census shaped like the real one but small — the base every broken fixture mutates. */
function fixtureCensus(overrides: Partial<Census> = {}): Census {
  return {
    capturedAt: '2026-08-17',
    stores: [
      { store: 's1', documents: 10, types: { Heading: { blocks: 1, docs: 1 }, Text: { blocks: 1, docs: 1 } } },
      { store: 's2', documents: 10, types: { Hero: { blocks: 1, docs: 1 }, Statement: { blocks: 1, docs: 1 } } },
      { store: 's3', documents: 10, types: { Quote: { blocks: 1, docs: 1 }, Divider: { blocks: 1, docs: 1 } } },
    ],
    quarantine: [],
    ...overrides,
  }
}

const noProblems = { unresolved: [], staleQuarantine: [], badSuccessor: [], missingMigration: [] }
const verdict = (c: ReturnType<typeof classify>) => ({
  unresolved: c.unresolved,
  staleQuarantine: c.staleQuarantine,
  badSuccessor: c.badSuccessor,
  missingMigration: c.missingMigration,
})

// ── The real tree ────────────────────────────────────────────────────────────────────────────

describe('the registry is readable, so nothing below passes vacuously', () => {
  it('resolves a real, non-trivial block registry', () => {
    // The control. If `config.components` ever came back empty (a bad import, a moved file), every
    // "type resolves" assertion below would invert into "type does not resolve" and every
    // "quarantine is honest" assertion would pass for the wrong reason.
    expect(REGISTRY_TYPES.length).toBeGreaterThanOrEqual(80)
    expect(REGISTRY_TYPES).toContain('Hero')
    expect(REGISTRY_TYPES).toContain('MediaText')
  })
})

describe('the census is a real corpus', () => {
  it('clears its integrity floors', () => {
    expect(integrityProblems(census)).toEqual([])
  })

  it('records the stores, documents and types it claims to', () => {
    const docs = (census.stores as StoreRow[]).reduce((n: number, s) => n + (s.documents ?? 0), 0)
    expect(census.stores.length).toBeGreaterThanOrEqual(MIN_STORES)
    expect(docs).toBeGreaterThanOrEqual(MIN_DOCUMENTS)
    expect(censusTypes(census).size).toBeGreaterThanOrEqual(MIN_TYPES)
  })

  it('covers the three live Puck document stores by name', () => {
    // Pinned by name, not by count: a store silently dropped from the capture is exactly the
    // "the thing I measure disappeared" failure the floors alone cannot tell from progress.
    const names = (census.stores as StoreRow[]).map((s) => s.store)
    expect(names).toContain('pages.data')
    expect(names).toContain('pages.published_data')
    expect(names).toContain('spaces.preferences.pageDocs')
  })
})

describe('THE INVARIANT — stored page data may not name a block the registry has retired', () => {
  const result = classify(census, REGISTRY_TYPES, {
    fileExists: (p: string) => existsSync(join(ROOT, p)),
    readFile: (p: string) => readFileSync(join(ROOT, p), 'utf8'),
  })

  it('every stored block type resolves, except the declared quarantine', () => {
    expect(
      result.unresolved,
      `These block types live in stored page documents and resolve to NOTHING in\n` +
        `lib/page-editor/config.tsx, so they render as nothing on a live page while the author's\n` +
        `copy sits in the database. Either restore the block, or add a quarantine entry to\n` +
        `${CENSUS_PATH} naming a successor AND a migration that rewrites the stored data.`,
    ).toEqual([])
  })

  it('no quarantine entry has rotted (the registry does not resolve it, and the data still has it)', () => {
    expect(
      result.staleQuarantine,
      'A quarantine entry that the registry now resolves — or that the census no longer records — ' +
        'is a stale claim. Delete it; an excuse nobody removes becomes permanent coverage.',
    ).toEqual([])
  })

  it('every quarantined type names a successor that actually resolves', () => {
    expect(
      result.badSuccessor,
      'A quarantined type whose successor is itself unknown has nowhere to go, which makes the ' +
        'quarantine a deletion wearing a migration\'s clothes.',
    ).toEqual([])
  })

  it('every quarantined type names a migration that exists and performs that exact rewrite', () => {
    expect(
      result.missingMigration,
      'The quarantine may only hold a type whose fix is IN THE TREE. Without this, "quarantined" ' +
        'degrades into "excused" and the excuse outlives the fix.',
    ).toEqual([])
  })

  it('reports the five orphans found in production, and no others', () => {
    // The live state as of 2026-08-17. This list SHRINKS to [] when the owner applies
    // 20270305000000 and re-captures the census; it must never grow without an ADR.
    expect(result.quarantined).toEqual(['BetaCTA', 'FeatureGallery', 'ImageBand', 'PageHero', 'ZigZag'])
  })
})

describe('the migration and the quarantine cannot drift apart', () => {
  it('the SQL maps every quarantined type to the successor the census claims', () => {
    for (const q of census.quarantine as Required<QuarantineRow>[]) {
      const sql = readFileSync(join(ROOT, q.migration), 'utf8')
      expect(mapsTypeToSuccessor(sql, q.type, q.successor), `${q.migration} does not map ${q.type} -> ${q.successor}`).toBe(true)
    }
  })

  it('every quarantined prop key is a declared field on its successor, so the rewrite is lossless', () => {
    // The mapping is only safe because `target_defaults || stored_props` cannot collide: every
    // prop key these retired blocks stored is a real field key on the target. Measured from the
    // live documents on 2026-08-17 and pinned here, because a field renamed on a target would
    // turn a lossless rewrite into a silent drop and nothing else would notice.
    const STORED_PROPS: Record<string, string[]> = {
      PageHero: ['title', 'eyebrow', 'subtitle', 'titleAccent'],
      ImageBand: ['image', 'alt', 'aspect'],
      ZigZag: ['image', 'alt', 'eyebrow', 'title', 'titleAccent', 'kicker', 'body', 'side', 'imgAspect', 'ctaLabel', 'ctaHref', 'tone'],
      FeatureGallery: ['eyebrow', 'heading', 'items'],
      BetaCTA: ['heading', 'headingAccent', 'body'],
    }
    for (const q of census.quarantine as Required<QuarantineRow>[]) {
      const target = config.components[q.successor]
      const fields = Object.keys(target?.fields ?? {})
      for (const key of STORED_PROPS[q.type] ?? []) {
        expect(fields, `${q.type}.${key} has no home on ${q.successor}`).toContain(key)
      }
    }
  })

  it('the migration is scoped to `data` and asserts `published_data` clean rather than rewriting it', () => {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20270305000000_pages_retire_orphan_block_types.sql'), 'utf8')
    expect(sql).toContain('update public.pages p')
    expect(sql).toContain("set data = jsonb_set(p.data, '{content}', r.content)")
    expect(sql).toContain('raise exception')
  })
})

// ── NON-VACUITY: every arm, driven by a fixture built to break it ─────────────────────────────

describe('NON-VACUITY — the detector fires', () => {
  const known = ['Heading', 'Text', 'Hero', 'Statement', 'Quote', 'Divider', 'MediaText']

  it('a clean fixture produces no findings at all (the control)', () => {
    expect(verdict(classify(fixtureCensus(), known))).toEqual(noProblems)
  })

  it('🔴 an UNDECLARED unknown type is reported', () => {
    const c = fixtureCensus()
    c.stores[0].types = { ...c.stores[0].types, RetiredThing: { blocks: 4, docs: 2 } }
    expect(classify(c, known).unresolved).toEqual(['RetiredThing'])
  })

  it('🔴 an unknown type in ANY store is reported, not just the first', () => {
    const c = fixtureCensus()
    c.stores[2].types = { ...c.stores[2].types, AlsoRetired: { blocks: 1, docs: 1 } }
    expect(classify(c, known).unresolved).toEqual(['AlsoRetired'])
  })

  it('🔴 the real five would ALL be reported if their quarantine entries were deleted', () => {
    // The strongest form of the proof: run the REAL census and the REAL registry with the
    // quarantine emptied. If this list were ever empty, the guard would be measuring nothing and
    // the arm above would be green for the wrong reason.
    const stripped = { ...census, quarantine: [] }
    expect(classify(stripped, REGISTRY_TYPES).unresolved).toEqual([
      'BetaCTA',
      'FeatureGallery',
      'ImageBand',
      'PageHero',
      'ZigZag',
    ])
  })

  it('🔴 a quarantine entry the registry resolves is reported as stale', () => {
    const c = fixtureCensus({
      quarantine: [{ type: 'Heading', successor: 'Text', migration: 'scripts/check-stored-blocks.mjs' }],
    })
    expect(classify(c, known).staleQuarantine).toEqual(['Heading'])
  })

  it('🔴 a quarantine entry for a type the census no longer records is reported as stale', () => {
    const c = fixtureCensus({
      quarantine: [{ type: 'GoneEntirely', successor: 'Text', migration: 'scripts/check-stored-blocks.mjs' }],
    })
    expect(classify(c, known).staleQuarantine).toEqual(['GoneEntirely'])
  })

  it('🔴 a quarantined type whose successor does not resolve is reported', () => {
    const c = fixtureCensus()
    c.stores[0].types = { ...c.stores[0].types, RetiredThing: { blocks: 1, docs: 1 } }
    c.quarantine = [{ type: 'RetiredThing', successor: 'AlsoNotABlock', migration: 'scripts/check-stored-blocks.mjs' }]
    const r = classify(c, known)
    expect(r.badSuccessor).toEqual(['RetiredThing'])
    expect(r.unresolved).toEqual([])
  })

  it('🔴 a quarantined type whose migration file is absent is reported', () => {
    const c = fixtureCensus()
    c.stores[0].types = { ...c.stores[0].types, RetiredThing: { blocks: 1, docs: 1 } }
    c.quarantine = [{ type: 'RetiredThing', successor: 'MediaText', migration: 'supabase/migrations/00000000000000_nope.sql' }]
    expect(classify(c, known, { fileExists: (p: string) => existsSync(join(ROOT, p)) }).missingMigration).toEqual(['RetiredThing'])
  })

  it('🔴 a quarantined type whose migration exists but maps it SOMEWHERE ELSE is reported', () => {
    // The subtle one, and the reason the check reads the SQL rather than just stat()ing it: a
    // migration file that exists proves nothing about what it does.
    const c = fixtureCensus()
    c.stores[0].types = { ...c.stores[0].types, ZigZag: { blocks: 1, docs: 1 } }
    c.quarantine = [{
      type: 'ZigZag',
      successor: 'Quote',  // the real migration maps it to MediaText
      migration: 'supabase/migrations/20270305000000_pages_retire_orphan_block_types.sql',
    }]
    expect(
      classify(c, known, {
        fileExists: (p: string) => existsSync(join(ROOT, p)),
        readFile: (p: string) => readFileSync(join(ROOT, p), 'utf8'),
      }).missingMigration,
    ).toEqual(['ZigZag'])
  })

  it('🔴 an emptied census fails its floors instead of reading as clean', () => {
    const empty: Census = { capturedAt: '2026-08-17', stores: [], quarantine: [] }
    expect(integrityProblems(empty).length).toBeGreaterThan(0)
    expect(classify(empty, known).integrity.length).toBeGreaterThan(0)
  })

  it('🔴 a store that records zero types fails, so a half-truncated capture cannot pass', () => {
    const c = fixtureCensus()
    c.stores[1].types = {}
    expect(integrityProblems(c).some((p) => p.includes('records no types'))).toBe(true)
  })

  it('🔴 a census with no capturedAt fails', () => {
    const c = fixtureCensus()
    delete c.capturedAt
    expect(integrityProblems(c).some((p) => p.includes('capturedAt'))).toBe(true)
  })
})

// ── The probe's three outcomes, all three exercised ───────────────────────────────────────────

describe('the probe answers 0 / 1 / 79 and never confuses them', () => {
  it('79 — a census below its floors is INDETERMINATE, never a verdict', () => {
    const empty: Census = { capturedAt: 'x', stores: [], quarantine: [] }
    expect(report(empty).code).toBe(INDETERMINATE)
  })

  it('1 — orphans remain (today\'s real state, because the migration is unapplied)', () => {
    expect(report(census).code).toBe(1)
  })

  it('0 — an empty quarantine over a real corpus is the done state', () => {
    const fixed = { ...census, quarantine: [] }
    expect(report(fixed).code).toBe(0)
  })

  it('loadCensus throws on a missing file rather than manufacturing an empty corpus', () => {
    expect(() => loadCensus('scripts/definitely-not-here.json')).toThrow()
  })
})
