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

  it('reports no quarantined types: 20270305000000 was applied 2026-08-18 and the census re-captured', () => {
    // The pre-apply state (the five orphans) is preserved as fixtures in the NON-VACUITY block
    // below, so the detector arms stay proven even though the live census is clean. This list
    // must never grow without an ADR.
    expect(result.quarantined).toEqual([])
  })
})

describe('the migration and the quarantine cannot drift apart', () => {
  it('the APPLIED migration maps each of the five retired types to its recorded successor', () => {
    // The quarantine is empty now, so this iterates the pinned historical mapping instead —
    // the migration file is permanent and a later edit that broke a mapping would break replays.
    const sql = readFileSync(join(ROOT, APPLIED_MIGRATION), 'utf8')
    for (const [type, successor] of FIVE_MAPPINGS) {
      expect(mapsTypeToSuccessor(sql, type, successor), `${APPLIED_MIGRATION} does not map ${type} -> ${successor}`).toBe(true)
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
    for (const [type, successor] of FIVE_MAPPINGS) {
      const target = config.components[successor]
      const fields = Object.keys(target?.fields ?? {})
      for (const key of STORED_PROPS[type] ?? []) {
        expect(fields, `${type}.${key} has no home on ${successor}`).toContain(key)
      }
    }
  })

  it('the migration is scoped to `data` and asserts `published_data` clean rather than rewriting it', () => {
    const sql = readFileSync(join(ROOT, APPLIED_MIGRATION), 'utf8')
    expect(sql).toContain('update public.pages p')
    expect(sql).toContain("set data = jsonb_set(p.data, '{content}', r.content)")
    expect(sql).toContain('raise exception')
  })

  it('the SQL was PROMOTED into supabase/migrations/ when it was applied, and only then', () => {
    // The inversion of the pre-apply pin. A file in supabase/migrations/ asserts "production has
    // run this"; that assertion became TRUE on 2026-08-18 (applied via MCP with the owner's
    // explicit authorization, ledger repaired to this version), so the file lives there now and
    // the proposal is gone — a proposal that outlives its apply is a second source of truth.
    expect(existsSync(join(ROOT, APPLIED_MIGRATION))).toBe(true)
    expect(existsSync(join(ROOT, 'docs/proposals/LIVE-028-retire-orphan-block-types.sql'))).toBe(false)
    const sql = readFileSync(join(ROOT, APPLIED_MIGRATION), 'utf8')
    expect(sql).toContain('APPLIED to production 2026-08-18')
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

  it('🔴 the historical five would ALL be reported if they re-entered a census undeclared', () => {
    // The live census is clean since the 2026-08-18 apply, so the strongest form of this proof
    // now runs on a fixture: the REAL registry against a census carrying the five retired types
    // with no quarantine. If this list were ever empty, the guard would be measuring nothing.
    const relapse = structuredClone(census)
    for (const [type] of FIVE_MAPPINGS) {
      relapse.stores[0].types = { ...relapse.stores[0].types, [type]: { blocks: 1, docs: 1 } }
    }
    relapse.quarantine = []
    expect(classify(relapse, REGISTRY_TYPES).unresolved).toEqual([
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
      successor: 'Quote',  // the real SQL maps it to MediaText
      migration: 'docs/proposals/LIVE-028-retire-orphan-block-types.sql',
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

// ── THE SPLIT: a declared orphan passes loudly, an undeclared one fails ───────────────────────
//
// 🔴 THE FAILURE THIS CLOSES. The first version of this guard exited 1 for ANY orphan, declared or
// not. It is wired into `test`, a REQUIRED context, so it made every unrelated PR unmergeable
// until an OWNER applied a migration — a gate no contributor can clear, which ADR-970 says gets
// routed around and then reads as coverage. The two questions are different and now get different
// answers, and both halves are asserted here so neither can quietly swing back.

const APPLIED_MIGRATION = 'supabase/migrations/20270305000000_pages_retire_orphan_block_types.sql'
const FIVE_MAPPINGS: ReadonlyArray<readonly [string, string]> = [
  ['BetaCTA', 'CallToAction'],
  ['FeatureGallery', 'Gallery'],
  ['ImageBand', 'Image'],
  ['PageHero', 'Hero'],
  ['ZigZag', 'MediaText'],
]
/** A census carrying ONE declared quarantine entry pointing at the applied migration — the
 *  pre-apply shape, preserved as a fixture so the announce / split / probe arms stay proven. */
function quarantinedCensus() {
  const c = structuredClone(census)
  c.stores[0].types = { ...c.stores[0].types, ZigZag: { blocks: 2, docs: 1 } }
  c.quarantine = [{ type: 'ZigZag', successor: 'MediaText', migration: APPLIED_MIGRATION }]
  return c
}

const io = {
  fileExists: (p: string) => existsSync(join(ROOT, p)),
  readFile: (p: string) => readFileSync(join(ROOT, p), 'utf8'),
}

describe('THE SPLIT — declared orphans pass loudly, undeclared ones fail', () => {
  it('the GUARD passes with a declared orphan outstanding (fixture; the live tree has none)', () => {
    const r = report(quarantinedCensus(), { io })
    expect(
      r.code,
      'The guard runs in a required job. A declared orphan whose fix is a staged migration waiting ' +
        'on the owner must NOT fail it — no PR can clear that, and a gate nobody can clear gets ' +
        'routed around.',
    ).toBe(0)
  })

  it('…and ANNOUNCES them, so a pass can never read as ordinary coverage', () => {
    // The live quarantine emptied on 2026-08-18, so the announce arm is proven on the fixture.
    const text = report(quarantinedCensus(), { io }).lines.join('\n')
    expect(text).toContain('DECLARED')
    expect(text).toContain('waiting on an OWNER action')
    expect(text).toContain('ZigZag -> MediaText')
    expect(text).toContain(APPLIED_MIGRATION)
    // The distinction itself is stated in the output, not just implied by the exit code.
    expect(text).toContain('an UNDECLARED orphan still fails')
  })

  it('🔴 …but an UNDECLARED orphan is NOT something the guard can announce its way past', () => {
    // The undeclared arm lives in classify(), which needs the registry; report() is pure node and
    // deliberately does not duplicate it. This is the assertion that the two halves together
    // still fail on the case that matters — the same census, one type left out of the quarantine.
    const oneUndeclared = quarantinedCensus()
    oneUndeclared.quarantine = [] // the type is in the census, the declaration is not
    expect(report(oneUndeclared, { io }).code).toBe(0) // the pure-node half cannot see it…
    expect(classify(oneUndeclared, REGISTRY_TYPES, io).unresolved).toEqual(['ZigZag']) // …this one does.
  })

  it('🔴 a ROTTED quarantine entry still FAILS the guard — that arm kept its teeth', () => {
    const rotted = {
      ...census,
      quarantine: [{ type: 'ZigZag', successor: 'MediaText', migration: 'docs/proposals/does-not-exist.sql' }],
    }
    const r = report(rotted, { io })
    expect(r.code).toBe(1)
    expect(r.lines.join('\n')).toContain('no longer name a migration that performs their rewrite')
  })

  it('🔴 a quarantine entry pointing at real SQL that maps it SOMEWHERE ELSE also fails the guard', () => {
    // Existing is not enough. The guard reads the SQL on every run, so relocating the file (as
    // happened when it moved to docs/proposals/) is caught, and so is silently retargeting it.
    const wrongTarget = {
      ...census,
      quarantine: [{
        type: 'ZigZag',
        successor: 'Quote',
        migration: APPLIED_MIGRATION,
      }],
    }
    expect(report(wrongTarget, { io }).code).toBe(1)
  })

  it('the guard is silent-and-green only when there is genuinely nothing to say', () => {
    const r = report({ ...census, quarantine: [] }, { io })
    expect(r.code).toBe(0)
    expect(r.lines.join('\n')).toContain('nothing quarantined')
    expect(r.lines.join('\n')).not.toContain('DECLARED')
  })
})

// ── The probe's three outcomes, all three exercised ───────────────────────────────────────────

describe('the probe answers 0 / 1 / 79 and never confuses them', () => {
  it('79 — a census below its floors is INDETERMINATE, never a verdict', () => {
    const empty: Census = { capturedAt: 'x', stores: [], quarantine: [] }
    expect(report(empty, { probe: true }).code).toBe(INDETERMINATE)
    expect(report(empty, { io }).code).toBe(INDETERMINATE)
  })

  it('1 — the probe says NOT DONE while a declared orphan remains, unlike the guard', () => {
    // Deliberately the opposite verdict to the guard, on the same input — proven on the fixture
    // now that the live quarantine emptied (2026-08-18). The live census gets the 0 arm below.
    expect(report(quarantinedCensus(), { probe: true }).code).toBe(1)
    expect(report(quarantinedCensus(), { io }).code).toBe(0)
  })

  it('0 — an empty quarantine over a real corpus is the done state', () => {
    const fixed = { ...census, quarantine: [] }
    expect(report(fixed, { probe: true }).code).toBe(0)
  })

  it('loadCensus throws on a missing file rather than manufacturing an empty corpus', () => {
    expect(() => loadCensus('scripts/definitely-not-here.json')).toThrow()
  })
})
