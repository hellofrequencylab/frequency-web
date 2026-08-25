import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  CORPUS_PATH,
  INDETERMINATE,
  MIN_DOCUMENTS,
  MIN_STORES,
  MIN_TYPES,
  classify,
  corpusTypes,
  integrityProblems,
  loadCorpus,
  report,
} from './check-entity-layouts.mjs'
import { ENTITY_BLOCKS } from '@/lib/entity-blocks/registry'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ENFORCING HALF of check:entity-layouts (ADR-1129).
//
// check-entity-layouts.mjs is pure node and cannot import a TS registry. This file can, so this
// is where "every type stored in an EntityLayout resolves, and is legal for the kind of the store
// it was found in" is actually asserted — against the LIVE ENTITY_BLOCKS, not a copy.
//
// ⚠️ HALF OF THIS FILE IS THE NON-VACUITY PROOF, deliberately, and for the reason the sibling
// guard states: a gate nobody has watched FAIL is a gate nobody has tested. Every arm below runs
// twice — once against the real tree, once against a fixture built to break it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..')
const corpus = loadCorpus(join(ROOT, CORPUS_PATH))
const REGISTRY = ENTITY_BLOCKS.map((b) => ({ id: b.id, kinds: [...b.kinds] }))

type Doc = {
  id: string
  store: string
  kind: string
  rows: Array<{ id: string; columns: number; cells: string[][] }>
  contentKeys: Record<string, string[]>
  styleKeys: Record<string, string[]>
  hidden: string[]
}
const docs = corpus.documents as Doc[]

function fixture(overrides: Partial<{ documents: Doc[] }> = {}) {
  return { ...corpus, ...overrides }
}

describe('the corpus itself', () => {
  it('passes its own integrity floors', () => {
    expect(integrityProblems(corpus)).toEqual([])
  })

  it('holds the stores and the volume it claims', () => {
    expect(docs.length).toBeGreaterThanOrEqual(MIN_DOCUMENTS)
    expect(new Set(docs.map((d) => d.store)).size).toBeGreaterThanOrEqual(MIN_STORES)
    expect(corpusTypes(corpus).size).toBeGreaterThanOrEqual(MIN_TYPES)
  })

  it('records the bench, which is the arm no other gate in this repo has', () => {
    const types = corpusTypes(corpus)
    expect([...types.values()].reduce((n, s) => n + s.benched, 0)).toBe(35)
    // The two types that carry 33 of those 35 bags. Pinned as placed-vs-benched DOCUMENT counts
    // because that ratio is the whole argument for the arm: `about` is authored on 17 documents
    // and placed on 1, so one operator edit makes it invisible to a cells-only walk. See the
    // guard's header — corpus-wide today it is still placed somewhere, and that is stated there
    // rather than papered over here.
    const perDoc = (type: string) => {
      let placed = 0
      let benched = 0
      for (const d of docs) {
        const cells = new Set(d.rows.flatMap((r) => r.cells.flat()))
        const authored = (d.contentKeys[type]?.length ?? 0) + (d.styleKeys[type]?.length ?? 0) > 0
        if (cells.has(type)) placed += 1
        else if (authored) benched += 1
      }
      return { placed, benched }
    }
    expect(perDoc('about')).toEqual({ placed: 1, benched: 17 })
    expect(perDoc('story')).toEqual({ placed: 2, benched: 16 })
  })
})

describe('classify, against the live registry', () => {
  it('finds nothing wrong with the tree as it stands', () => {
    const { unresolvedPlaced, unresolvedBenched, illegalKind } = classify(corpus, REGISTRY)
    expect({ unresolvedPlaced, unresolvedBenched, illegalKind }).toEqual({
      unresolvedPlaced: [],
      unresolvedBenched: [],
      illegalKind: [],
    })
  })

  it('every type the corpus names is a real registry row', () => {
    const known = new Set(REGISTRY.map((b) => b.id))
    for (const type of corpusTypes(corpus).keys()) expect(known, type).toContain(type)
  })

  // ── NON-VACUITY ─────────────────────────────────────────────────────────────────────────────

  it('FAILS when a PLACED type is retired from the registry', () => {
    const without = REGISTRY.filter((b) => b.id !== 'editorial')
    expect(classify(corpus, without).unresolvedPlaced).toContain('editorial')
    expect(report(corpus, { registry: without }).code).toBe(1)
  })

  it('FAILS when a BENCHED type is retired — the case that motivated the gate', () => {
    // Drop `about`'s single placement (one operator edit) and its 17 authored bags are named by
    // no cell anywhere. This is the corpus one step from today, and the step is cheap.
    const oneEditAway = fixture({
      documents: docs.map((d) => ({
        ...d,
        rows: d.rows.map((r) => ({ ...r, cells: r.cells.map((c) => c.filter((t) => t !== 'about')) })),
      })),
    })
    const without = REGISTRY.filter((b) => b.id !== 'about')
    const verdict = classify(oneEditAway, without)
    // A placements-only guard sees nothing here: there is no cell left to walk.
    expect(corpusTypes(oneEditAway).get('about')?.placed).toBe(0)
    expect(verdict.unresolvedPlaced).not.toContain('about')
    expect(verdict.unresolvedBenched).toContain('about')
    const { code, lines } = report(oneEditAway, { registry: without })
    expect(code).toBe(1)
    expect(lines.join('\n')).toMatch(/about\s+BENCHED/)
    // …and while the row is present, the same corpus is clean. The arm reports the retirement,
    // not the bench.
    expect(report(oneEditAway, { registry: REGISTRY }).code).toBe(0)
  })

  it('FAILS when a registry row narrows kinds[] under a document that already stores it', () => {
    const narrowed = REGISTRY.map((b) => (b.id === 'callout' ? { ...b, kinds: ['space'] } : b))
    const verdict = classify(corpus, narrowed)
    expect(verdict.illegalKind).toContainEqual({ type: 'callout', kind: 'email', kinds: ['space'] })
    expect(report(corpus, { registry: narrowed }).code).toBe(1)
  })

  it('does NOT count an empty bag as evidence a type is in use', () => {
    // `divider: {}` is stored on live email documents and carries nothing. Counting it would make
    // the guard demand a registry row for a bag with no author work in it.
    const withEmptyBag = fixture({
      documents: [
        ...docs,
        {
          id: 'synthetic-empty-bag',
          store: 'campaigns.block_json',
          kind: 'email',
          rows: [{ id: 'r0', columns: 1, cells: [['text']] }],
          contentKeys: { ghostBlock: [] },
          styleKeys: {},
          hidden: [],
        },
      ],
    })
    expect(corpusTypes(withEmptyBag).has('ghostBlock')).toBe(false)
    expect(classify(withEmptyBag, REGISTRY).unresolvedBenched).toEqual([])
  })

  it('counts a HIDDEN id with no placement, which is also invisible to a cells-only walk', () => {
    const withHidden = fixture({
      documents: [
        ...docs,
        {
          id: 'synthetic-hidden',
          store: 'spaces.preferences.profileLayout',
          kind: 'space',
          rows: [{ id: 'r0', columns: 1, cells: [['text']] }],
          contentKeys: {},
          styleKeys: {},
          hidden: ['retiredBlock'],
        },
      ],
    })
    expect(classify(withHidden, REGISTRY).unresolvedBenched).toContain('retiredBlock')
  })
})

describe('integrity, driven to failure', () => {
  it('a truncated corpus is INDETERMINATE, never a clean pass', () => {
    const empty = fixture({ documents: [] })
    expect(integrityProblems(empty).length).toBeGreaterThan(0)
    expect(report(empty).code).toBe(INDETERMINATE)
    expect(report(empty, { registry: REGISTRY }).code).toBe(INDETERMINATE)
  })

  it('a corpus with no capture date or no recapture query fails', () => {
    expect(integrityProblems({ ...corpus, capturedAt: undefined }).join(' ')).toMatch(/capturedAt/)
    expect(integrityProblems({ ...corpus, recaptureQuery: undefined }).join(' ')).toMatch(/recaptureQuery/)
  })

  it('a document whose row shape is inconsistent fails', () => {
    const broken = fixture({
      documents: [
        ...docs,
        {
          id: 'synthetic-broken',
          store: 'spaces.preferences.profileLayout',
          kind: 'space',
          rows: [{ id: 'r0', columns: 3, cells: [['text']] }],
          contentKeys: {},
          styleKeys: {},
          hidden: [],
        },
      ],
    })
    expect(integrityProblems(broken).join(' ')).toMatch(/declares 3 column\(s\) but holds 1 cell stack/)
  })

  it('a document with no kind fails, because kind legality cannot be checked without it', () => {
    const kindless = fixture({
      documents: docs.map((d, i) => (i === 0 ? { ...d, kind: undefined as unknown as string } : d)),
    })
    expect(integrityProblems(kindless).join(' ')).toMatch(/has no "kind"/)
  })

  it('a missing corpus throws rather than defaulting to an empty one', () => {
    expect(() => loadCorpus(join(ROOT, 'scripts/does-not-exist.json'))).toThrow(/missing/)
  })
})

describe('the report', () => {
  it('passes on the real tree, and says which half it checked', () => {
    const cli = report(corpus)
    expect(cli.code).toBe(0)
    expect(cli.lines.join('\n')).toMatch(/Integrity only/)

    const full = report(corpus, { registry: REGISTRY })
    expect(full.code).toBe(0)
    expect(full.lines.join('\n')).toMatch(/resolves and is legal for its kind/)
    // The header must carry real numbers, or a green line says nothing.
    expect(full.lines.join('\n')).toMatch(/\d+ document\(s\) across \d+ store\(s\)/)
    expect(full.lines.join('\n')).toMatch(/35 benched bag\(s\)/)
  })
})
