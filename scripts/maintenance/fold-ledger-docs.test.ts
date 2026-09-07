import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mergeBacklog, mergeDecisions } from './fold-ledger-docs.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CI HALF OF THE LEDGER FOLD (HYG-032).
//
// `scripts/maintenance/fold-ledger-docs.mjs` resolves the two conflicts EVERY merge re-creates:
// docs/DECISIONS.md (both sides append an ADR at the tail) and docs/BUILD-BACKLOG.json (both sides
// add rows). Measured across a whole queue with `git merge-tree --write-tree`, those two paths were
// the entire conflict set — zero code conflicts, those two files every time — and two sessions in a
// row hand-resolved them eleven times each.
//
// A tool that resolves conflicts UNATTENDED has to be wrong loudly rather than quietly, so the three
// rules below are the ones worth a test rather than a comment. Each is here because it has already
// been broken once, in this repo, at a cost.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..', '..')
type Row = { id: string; title: string; status: string; lane: string }
const row = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  title: `${id} title`,
  status: 'open',
  lane: 'live',
  ...extra,
})
const doc = (...rows: Row[]) => JSON.stringify({ entries: rows }, null, 2)

describe('the JSON half merges by row id', () => {
  it('takes each side’s own additions, in main’s order, with this branch’s appended', () => {
    const base = doc(row('A'), row('B'))
    const theirs = doc(row('A'), row('B'), row('MAIN-1')) // main added one
    const ours = doc(row('A'), row('B'), row('BRANCH-1')) // this branch added another
    const r = mergeBacklog(base, ours, theirs) as { text: string; count: number; bothChanged: string[] }
    expect(r.bothChanged).toEqual([])
    expect(JSON.parse(r.text).entries.map((e: { id: string }) => e.id)).toEqual(['A', 'B', 'MAIN-1', 'BRANCH-1'])
  })

  it('lets whichever side actually moved a row win, on either side', () => {
    // The everyday case: main closes a row while this branch adds rows, or vice versa. Guessing
    // here is how a status list starts lying, so both directions are pinned.
    const base = doc(row('A'), row('B'))
    const mainClosedA = doc(row('A', { status: 'done' }), row('B'))
    const branchClosedB = doc(row('A'), row('B', { status: 'done' }))
    const fromMain = JSON.parse(
      (mergeBacklog(base, doc(row('A'), row('B')), mainClosedA) as { text: string }).text,
    )
    const fromBranch = JSON.parse(
      (mergeBacklog(base, branchClosedB, doc(row('A'), row('B'))) as { text: string }).text,
    )
    expect(fromMain.entries.find((e: { id: string }) => e.id === 'A').status).toBe('done')
    expect(fromBranch.entries.find((e: { id: string }) => e.id === 'B').status).toBe('done')
  })

  it('🔴 REFUSES, naming the id, when both sides edited the SAME row', () => {
    // This case is real: HYG-020 was edited on both sides in one session, main holding it `open`
    // and the closing PR holding it `done`. A tool that picked a winner there would have published
    // a status nobody decided. It must stop and hand the row back.
    const base = doc(row('A'), row('SHARED'))
    const theirs = doc(row('A'), row('SHARED', { status: 'done' }))
    const ours = doc(row('A'), row('SHARED', { status: 'blocked' }))
    const r = mergeBacklog(base, ours, theirs) as { bothChanged: string[] }
    expect(r.bothChanged).toEqual(['SHARED'])
  })

  it('🔴 refuses a side that ALREADY carries a duplicate row id, instead of silently deduping it', () => {
    // A duplicated id has already reached this repo's history once, by hand, and cost a CI round.
    // This test found a real hole when it was written: the fold indexed each side with `new Map()`,
    // which keeps the LAST row for a repeated id and drops the rest without a word — so a duplicate
    // arriving on either side would have been quietly resolved by losing a row. Losing a row
    // silently is worse than the conflict this tool exists to fix, so it is an error that names the
    // side and the id.
    const dupes = JSON.stringify({ entries: [row('A'), row('A')] }, null, 2)
    expect(() => mergeBacklog(doc(), dupes, doc())).toThrow(/\(ours\) already has duplicate row id\(s\): A/)
    expect(() => mergeBacklog(doc(), doc(), dupes)).toThrow(/\(theirs\) already has duplicate row id\(s\): A/)
    // ...and the paired positive: a clean side must NOT be reported as duplicated.
    expect(() => mergeBacklog(doc(), doc(row('A'), row('B')), doc(row('A')))).not.toThrow()
  })

  it('says which side is unparseable instead of throwing a bare JSON error', () => {
    expect(() => mergeBacklog(doc(), '{ not json', doc())).toThrow(/\(ours\) is not valid JSON/)
  })
})

describe('the fold is byte-faithful to the file it is replacing', () => {
  // ⚠️ THIS IS THE ROW THAT ALREADY DRIFTED. The tool's header said "with a single trailing
  // newline" and the code obeyed it; the real file ends at the closing brace with nothing after.
  // A one-byte difference survives review, and it costs a spurious "last line changed" hunk on the
  // branch that introduces it plus the same hunk in reverse on every branch that merges after.
  it('ends exactly where docs/BUILD-BACKLOG.json ends — no trailing newline', () => {
    const real = readFileSync(path.join(ROOT, 'docs/BUILD-BACKLOG.json'), 'utf8')
    expect(real.endsWith('\n'), 'docs/BUILD-BACKLOG.json grew a trailing newline').toBe(false)
    const r = mergeBacklog(doc(row('A')), doc(row('A')), doc(row('A'))) as { text: string }
    expect(r.text.endsWith('}')).toBe(true)
    expect(r.text.endsWith('\n')).toBe(false)
  })

  it('emits two-space indentation, the shape every other row in the file already has', () => {
    const r = mergeBacklog(doc(row('A')), doc(row('A')), doc(row('A'))) as { text: string }
    expect(r.text).toContain('\n  "entries": [')
    expect(r.text).toContain('\n    {\n      "id": "A"')
  })

  it('carries the document’s non-entry keys through from main', () => {
    const withMeta = (rows: unknown[], meta: string) =>
      JSON.stringify({ schema: meta, entries: rows }, null, 2)
    const r = mergeBacklog(withMeta([row('A')], 'v1'), withMeta([row('A')], 'v1'), withMeta([row('A')], 'v2')) as {
      text: string
    }
    expect(JSON.parse(r.text).schema).toBe('v2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// meta.slate — THE ONE NON-ENTRY KEY THAT IS NOT MAIN'S TO KEEP.
//
// The slate is a VIEW OVER THE ENTRIES, and the fold has just changed which entries are done, so
// carrying main's copy through unread hands back a file that contradicts itself. HYG-047 measures
// exactly that, and it fired on all five folds of the 2026-09-06/07 seven-PR stack — each fixed by
// hand with the same three lines, by a tool whose whole purpose is that this file is never
// hand-edited.
//
// Every test below fails against the pre-fix driver, which is the only reason to trust them.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('meta.slate is folded beside the entries, then reconciled against them', () => {
  const slated = (rows: Row[], waves: { name: string; ids: string[] }[]) =>
    JSON.stringify({ entries: rows, meta: { slate: { note: 'n', waves } } }, null, 2)
  const slateOf = (text: string) => JSON.parse(text).meta.slate.waves as { name: string; ids: string[] }[]

  it('🔴 drops a row THIS BRANCH closed but main still lists as active work', () => {
    // The exact five-times shape: ours closes A, main's slate still carries it.
    const base = slated([row('A'), row('B')], [{ name: 'W0', ids: ['A', 'B'] }])
    const ours = slated([row('A', { status: 'done' }), row('B')], [{ name: 'W0', ids: ['B'] }])
    const theirs = slated([row('A'), row('B')], [{ name: 'W0', ids: ['A', 'B'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string; slate: { done: string[] } }
    expect(slateOf(r.text)[0].ids).toEqual(['B'])
    expect(r.slate.done).toEqual(['A'])
  })

  it('🔴 drops a row MAIN closed, so the reconcile does not depend on which side did it', () => {
    const base = slated([row('A'), row('B')], [{ name: 'W0', ids: ['A', 'B'] }])
    const ours = slated([row('A'), row('B')], [{ name: 'W0', ids: ['A', 'B'] }])
    const theirs = slated([row('A', { status: 'done' }), row('B')], [{ name: 'W0', ids: ['A', 'B'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string }
    expect(slateOf(r.text)[0].ids).toEqual(['B'])
  })

  it('keeps THIS BRANCH’s placement of a row main has never seen', () => {
    // A new open row filed on the branch stays placed — otherwise HYG-047 fails it as unplaced,
    // and the fold would have created the very violation it is meant to prevent.
    const base = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const ours = slated([row('A'), row('NEW')], [{ name: 'W0', ids: ['A', 'NEW'] }])
    const theirs = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string }
    expect(slateOf(r.text)[0].ids).toEqual(['A', 'NEW'])
  })

  it('drops an id that names no row at all, rather than emitting a phantom', () => {
    const base = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const ours = slated([row('A')], [{ name: 'W0', ids: ['A', 'GHOST'] }])
    const theirs = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string; slate: { phantom: string[] } }
    expect(slateOf(r.text)[0].ids).toEqual(['A'])
    expect(r.slate.phantom).toEqual(['GHOST'])
  })

  it('places a row once when the two sides put it in DIFFERENT waves, first wave winning', () => {
    const base = slated([row('A')], [{ name: 'W0', ids: [] }, { name: 'W1', ids: [] }])
    const ours = slated([row('A')], [{ name: 'W0', ids: [] }, { name: 'W1', ids: ['A'] }])
    const theirs = slated([row('A')], [{ name: 'W0', ids: ['A'] }, { name: 'W1', ids: [] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string; slate: { duplicate: string[] } }
    expect(slateOf(r.text).map((w) => w.ids)).toEqual([['A'], []])
    expect(r.slate.duplicate).toEqual(['A'])
  })

  it('⚪ does NOT invent a wave for an unplaced open row — that judgement is a human’s', () => {
    // Going green by guessing build ORDER is how a slate starts lying. HYG-047 should fail here,
    // and the fold must leave it failing rather than paper over it.
    const base = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const ours = slated([row('A'), row('LOOSE')], [{ name: 'W0', ids: ['A'] }])
    const theirs = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string }
    expect(slateOf(r.text).flatMap((w) => w.ids)).not.toContain('LOOSE')
  })

  it('leaves a document with no slate exactly as main had it', () => {
    const r = mergeBacklog(doc(row('A')), doc(row('A')), doc(row('A'))) as { text: string }
    expect(JSON.parse(r.text).meta).toBeUndefined()
  })

  it('keeps the slate’s own non-wave keys, and the wave’s, from main', () => {
    const base = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const r = mergeBacklog(base, base, base) as { text: string }
    expect(JSON.parse(r.text).meta.slate.note).toBe('n')
    expect(slateOf(r.text)[0].name).toBe('W0')
  })
})

describe('the Markdown half appends, and knows when it is not an append', () => {
  it('keeps main’s block first and this branch’s after', () => {
    const base = '# ADRs\n\n## ADR-1\n'
    const r = mergeDecisions(base, base + '## ADR-BRANCH\n', base + '## ADR-MAIN\n') as { text: string }
    expect(r.text).toBe(base + '## ADR-MAIN\n## ADR-BRANCH\n')
  })

  it('🔴 hands back a side that EDITED the shared body rather than appending', () => {
    // Theirs-then-ours is only sound while both sides are pure appends. A side that rewrote an
    // existing ADR would have that rewrite silently dropped, which is worse than a conflict marker.
    const base = '# ADRs\n\n## ADR-1: original\n'
    const r = mergeDecisions(base, '# ADRs\n\n## ADR-1: rewritten\n', base + '## ADR-MAIN\n') as {
      needsHuman?: string
    }
    expect(r.needsHuman).toMatch(/edited the existing body/)
  })
})

describe('the tool does not run itself on import', () => {
  it('guards main() behind an argv check', () => {
    // Without the guard, importing this module from the test runner shells out to git and calls
    // process.exit() mid-suite. The import at the top of this file is the live proof; the assertion
    // is what keeps the guard from being removed as "unused".
    const src = readFileSync(path.join(ROOT, 'scripts/maintenance/fold-ledger-docs.mjs'), 'utf8')
    expect(src).toContain('fileURLToPath(import.meta.url)')
    expect(src.indexOf('process.exit(main())')).toBeGreaterThan(src.indexOf('fileURLToPath(import.meta.url)'))
  })
})
