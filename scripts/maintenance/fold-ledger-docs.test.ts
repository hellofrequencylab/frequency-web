import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mergeBacklog, mergeDecisions, splitAdrs, waveToken } from './fold-ledger-docs.mjs'

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

  it('🔴 matches a wave main RENAMED by its token, keeping main’s name, instead of appending a copy (HYG-134)', () => {
    // The 2026-09-29 shape: the backlog cull appended "── PARKED ..." to the W4 name, and a branch
    // cut before it folded against main and appended its old "W4 · old" as a second W4.
    const base = slated([row('A'), row('B')], [{ name: 'W4 · old', ids: ['A'] }])
    const ours = slated([row('A'), row('B')], [{ name: 'W4 · old', ids: ['A', 'B'] }])
    const theirs = slated([row('A'), row('B')], [{ name: 'W4 · old ── PARKED', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string }
    const w4 = slateOf(r.text).filter((w) => waveToken(w.name) === 'W4')
    expect(w4).toHaveLength(1)
    expect(w4[0].name).toBe('W4 · old ── PARKED')
    expect(w4[0].ids).toEqual(['A', 'B']) // the branch's placement still unions in
  })

  it('still appends a wave token only this branch has', () => {
    const base = slated([row('A'), row('B')], [{ name: 'W0 · now', ids: ['A'] }])
    const ours = slated([row('A'), row('B')], [{ name: 'W0 · now', ids: ['A'] }, { name: 'W99 · new phase', ids: ['B'] }])
    const theirs = slated([row('A'), row('B')], [{ name: 'W0 · now, reworded', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string }
    expect(slateOf(r.text).map((w) => w.name)).toEqual(['W0 · now, reworded', 'W99 · new phase'])
  })

  it('🔴 drops a PARKED id this branch still has on a wave main took it off, and reports it (HYG-134)', () => {
    // Main parked P and removed it from W4; the pre-cull branch still lists it. Parked rows sit on no
    // wave (the reason and date live on the row), so the union must not put it back.
    const base = slated([row('A'), row('P')], [{ name: 'W4 · x', ids: ['A', 'P'] }])
    const ours = slated([row('A'), row('P')], [{ name: 'W4 · x', ids: ['A', 'P'] }])
    const theirs = slated([row('A'), row('P', { status: 'parked' })], [{ name: 'W4 · x', ids: ['A'] }])
    const r = mergeBacklog(base, ours, theirs) as { text: string; slate: { parked: string[]; done: string[] } }
    expect(slateOf(r.text)[0].ids).toEqual(['A'])
    expect(r.slate.parked).toEqual(['P'])
    expect(r.slate.done).toEqual([])
  })

  it('keeps a BLOCKED row on its wave — HYG-047 requires every open or blocked row placed', () => {
    const base = slated([row('A')], [{ name: 'W0', ids: ['A'] }])
    const blocked = slated([row('A', { status: 'blocked' })], [{ name: 'W0', ids: ['A'] }])
    const r = mergeBacklog(base, base, blocked) as { text: string }
    expect(slateOf(r.text)[0].ids).toEqual(['A'])
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

describe('the Markdown half merges by ADR number', () => {
  // ⚠️ THIS BLOCK USED TO PIN AN APPEND-ONLY FOLD, and that premise was false. The old
  // implementation required `ours.startsWith(base) && theirs.startsWith(base)` and refused anything
  // else. Measured against the seven PRs conflicting on this path on 2026-09-28 it refused 7 of 7,
  // because main does not only append: it inserts an ADR beside its topical neighbours and edits the
  // theme index in the same commit. A tool that refuses every real case is not a safety net, so the
  // case the old test called "not an append" is now a case this merge RESOLVES, and the cases below
  // pin the shape that replaced it.
  const base = '# ADRs\n\n## ADR-1\nbody one\n\n## ADR-2\nbody two\n'

  it('keeps main’s order, with this branch’s new ADR appended', () => {
    const r = mergeDecisions(base, base + '\n## ADR-9\nbranch\n', base + '\n## ADR-8\nmain\n') as {
      text: string
    }
    expect(r.text.indexOf('ADR-8')).toBeLessThan(r.text.indexOf('ADR-9'))
    expect(r.text).toContain('## ADR-9\nbranch')
    expect(r.text).toContain('## ADR-8\nmain')
  })

  it('🔴 takes an INSERTION main made in the middle, which the old append-only fold refused', () => {
    // This is the case that broke every real merge: main put ADR-5 between 1 and 2 rather than at
    // the tail, so neither side was a prefix of the other.
    const mainSide = '# ADRs\n\n## ADR-1\nbody one\n\n## ADR-5\ninserted\n\n## ADR-2\nbody two\n'
    const r = mergeDecisions(base, base + '\n## ADR-9\nbranch\n', mainSide) as { text: string }
    expect(r.text).toContain('## ADR-5\ninserted')
    expect(r.text).toContain('## ADR-9\nbranch')
    expect(r.text.indexOf('ADR-5')).toBeLessThan(r.text.indexOf('ADR-2'))
  })

  it('lets whichever side actually edited an ADR win, on either side', () => {
    const ours = base.replace('body one', 'body one, revised by the branch')
    const theirs = base.replace('body two', 'body two, revised by main')
    const r = mergeDecisions(base, ours, theirs) as { text: string }
    expect(r.text).toContain('revised by the branch')
    expect(r.text).toContain('revised by main')
  })

  it('🔴 REFUSES, naming the number, when both sides edited the SAME ADR', () => {
    const ours = base.replace('body one', 'the branch says this')
    const theirs = base.replace('body one', 'main says that')
    const r = mergeDecisions(base, ours, theirs) as { bothChanged: string[] }
    expect(r.bothChanged).toEqual(['1'])
  })

  it('🔴 REFUSES when both sides edited the preamble, which carries the theme index', () => {
    const ours = base.replace('# ADRs', '# ADRs\nbranch index line')
    const theirs = base.replace('# ADRs', '# ADRs\nmain index line')
    const r = mergeDecisions(base, ours, theirs) as { bothChanged: string[] }
    expect(r.bothChanged).toContain('preamble')
  })

  it('folds a preamble edit on ONE side with a new ADR on the other', () => {
    // The theme-index-plus-new-ADR commit, which is what main actually does.
    const theirs = base.replace('# ADRs', '# ADRs\nmain index line') + '\n## ADR-8\nmain\n'
    const r = mergeDecisions(base, base + '\n## ADR-9\nbranch\n', theirs) as { text: string }
    expect(r.text).toContain('main index line')
    expect(r.text).toContain('## ADR-9\nbranch')
  })

  it('🔴 refuses a side that ALREADY declares an ADR number twice, instead of silently dropping one', () => {
    const dupe = base + '\n## ADR-1\na second ADR-1\n'
    expect(() => mergeDecisions(base, dupe, base)).toThrow(/more than once/)
  })

  it('🔴 splitAdrs is lossless on the real docs/DECISIONS.md', () => {
    // The one unrecoverable failure for this tool is losing a block. Round-tripping the real file is
    // the only assertion that proves it cannot.
    const real = readFileSync(path.join(ROOT, 'docs/DECISIONS.md'), 'utf8')
    const { preamble, blocks } = splitAdrs(real)
    expect(blocks.length).toBeGreaterThan(1000)
    const rebuilt = blocks.length ? [preamble, ...blocks.map((b) => b.text)].join('\n') : preamble
    expect(rebuilt).toBe(real)
  })

  it('uses check-adr.mjs’s own HEADING regex, so the tool and the gate cannot disagree', () => {
    const src = readFileSync(path.join(ROOT, 'scripts/maintenance/fold-ledger-docs.mjs'), 'utf8')
    expect(src).toMatch(/import \{ HEADING \} from '\.\.\/check-adr\.mjs'/)
  })
})

describe('the tool does not run itself on import', () => {
  it('guards main() behind an argv check', () => {
    // Without the guard, importing this module from the test runner shells out to git and calls
    // process.exit() mid-suite. The import at the top of this file is the live proof; the assertion
    // is what keeps the guard from being removed as "unused".
    // HYG-125: the guard now asks scripts/lib/invoked-directly.mjs, which realpaths both sides. The
    // spelling this used to pin (`fileURLToPath(import.meta.url) === path.resolve(argv[1])`) was false
    // through a symlink, so the module's main() silently did not run where it should have.
    const src = readFileSync(path.join(ROOT, 'scripts/maintenance/fold-ledger-docs.mjs'), 'utf8')
    expect(src).toContain('invokedDirectly(import.meta.url)')
    expect(src.indexOf('process.exit(main())')).toBeGreaterThan(src.indexOf('invokedDirectly(import.meta.url)'))
  })
})
