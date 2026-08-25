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
