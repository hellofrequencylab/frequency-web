// The ledger loader (HYG-145, ADR-1635): base file + fragments, one merged view every reader uses.
//
// Each case pins a consequence a reader depends on: a patch lands, an append composes, a closed row
// leaves its wave, a broken fragment is named rather than skipped, and a tree with no fragments
// reads exactly as its base file. The converter's two pure halves are pinned at the bottom.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  applyRowFragments,
  compareIds,
  fragmentCount,
  fragmentIdsFromPaths,
  loadBacklog,
  loadDecisions,
  mergeAdrFragments,
  readBacklogView,
  readDecisionsView,
  COMPACT_AT,
} from './ledger.mjs'
import { rowFragmentsFromDiff, adrFragmentsFromDiff } from '../ledger.mjs'

type Row = Record<string, unknown> & { id: string }
const row = (id: string, status = 'open', extra: Record<string, unknown> = {}): Row => ({
  id,
  title: `${id} title`,
  status,
  lane: 'live',
  detail: `${id} detail.`,
  ...extra,
})
const doc = (entries: Row[], waves = [{ name: 'W1 · first', ids: ['A-1'] }, { name: 'W2 · second', ids: [] as string[] }]) => ({
  meta: { slate: { waves } },
  entries,
})
const frag = (id: string, body: unknown) => ({ path: `docs/ledger/rows/${id}.json`, id, body, problem: null })

describe('applyRowFragments: patch semantics', () => {
  it('sets keys, deletes a key with null, replaces an object whole, and appends to a string and an array', () => {
    const base = doc([row('A-1', 'open', { notes: ['one'], verify: { kind: 'cmd', cmd: 'old', note: 'n' }, size: 'S' })])
    const r = applyRowFragments(base, [
      frag('A-1', {
        id: 'A-1',
        patch: { status: 'done', closed: '2026-09-29', size: null, verify: { kind: 'cmd', cmd: 'new' } },
        append: { detail: '\n\nCLOSED.', notes: ['two'] },
      }),
    ])
    expect(r.problems).toEqual([])
    const a = r.doc.entries[0]
    expect(a.status).toBe('done')
    expect(a.closed).toBe('2026-09-29')
    expect('size' in a).toBe(false)
    expect(a.verify).toEqual({ kind: 'cmd', cmd: 'new' })
    expect(a.detail).toBe('A-1 detail.\n\nCLOSED.')
    expect(a.notes).toEqual(['one', 'two'])
    expect(base.entries[0].status, 'the base document is never mutated').toBe('open')
  })

  it('appends new rows after the base, in numeric id order, and strips the wave key from the row', () => {
    const base = doc([row('A-1')])
    const r = applyRowFragments(base, [
      frag('HYG-100', { ...row('HYG-100'), wave: 'W2' }),
      frag('HYG-99', row('HYG-99')),
    ].sort((x, y) => compareIds(x.id, y.id)))
    expect(r.problems).toEqual([])
    expect(r.doc.entries.map((e: Row) => e.id)).toEqual(['A-1', 'HYG-99', 'HYG-100'])
    expect('wave' in r.doc.entries[2]).toBe(false)
    expect(r.doc.meta.slate.waves[1].ids).toEqual(['HYG-100'])
  })

  it('refuses a patch that renames the row, an unknown key, and a wrong-typed append', () => {
    const r = applyRowFragments(doc([row('A-1')]), [
      frag('A-1', { id: 'A-1', patch: { id: 'B-1' }, apend: {}, append: { detail: 3 } }),
    ])
    expect(r.problems.join('\n')).toMatch(/may not change the row id/)
    expect(r.problems.join('\n')).toMatch(/unknown key "apend"/)
    expect(r.problems.join('\n')).toMatch(/append.detail must be a string or an array/)
  })

  it('names every broken fragment instead of skipping it', () => {
    const r = applyRowFragments(doc([row('A-1')]), [
      frag('A-1', row('A-1')), // full row whose id exists
      frag('B-1', { id: 'B-1', patch: { status: 'done' } }), // edit of a missing row
      frag('C-1', { ...row('C-2') }), // file named for another id
      frag('D-1', { ...row('D-1'), wave: 'W9' }), // unknown wave token
      { path: 'docs/ledger/rows/E-1.json', id: 'E-1', body: null, problem: 'docs/ledger/rows/E-1.json is not valid JSON: x' },
    ])
    const all = r.problems.join('\n')
    expect(all).toMatch(/A-1\.json: is a full row, and A-1 already exists/)
    expect(all).toMatch(/B-1\.json: edits B-1, and no row B-1 exists/)
    expect(all).toMatch(/C-1\.json: its "id" is "C-2"/)
    expect(all).toMatch(/D-1\.json: no meta.slate wave has the token "W9"/)
    expect(all).toMatch(/E-1\.json is not valid JSON/)
  })
})

describe('applyRowFragments: waves', () => {
  it('drops done and parked ids from every wave at load time, whichever file closed them', () => {
    const base = doc(
      [row('A-1'), row('B-1', 'done'), row('C-1', 'parked'), row('D-1', 'blocked')],
      [{ name: 'W1 · x', ids: ['A-1', 'B-1', 'C-1', 'D-1', 'GHOST-1'] }],
    )
    const r = applyRowFragments(base, [frag('A-1', { id: 'A-1', patch: { status: 'done' } })])
    expect(r.doc.meta.slate.waves[0].ids, 'open/blocked stay; a phantom stays for HYG-047 to name').toEqual(['D-1', 'GHOST-1'])
    expect(r.dropped.sort()).toEqual(['A-1', 'B-1', 'C-1'])
  })

  it('moves a row to another wave, and takes it off every wave with null', () => {
    const base = doc([row('A-1'), row('B-1')], [{ name: 'W1 · x', ids: ['A-1', 'B-1'] }, { name: 'W2 · y', ids: [] }])
    const r = applyRowFragments(base, [
      frag('A-1', { id: 'A-1', wave: 'W2' }),
      frag('B-1', { id: 'B-1', wave: null }),
    ])
    expect(r.problems).toEqual([])
    expect(r.doc.meta.slate.waves.map((w: { ids: string[] }) => w.ids)).toEqual([[], ['A-1']])
  })
})

describe('mergeAdrFragments', () => {
  const base = '# Ledger\n\n## ADR-001: one\n\nBody.\n'
  const adr = (id: string, text: string) => ({ path: `docs/ledger/adr/ADR-${id}.md`, id, text })

  it('appends fragments in number order, one blank line apart, one trailing newline', () => {
    const r = mergeAdrFragments(base, [adr('3', '## ADR-3: three\n\nC.\n\n\n'), adr('10', '## ADR-10: ten\n\nX.')].sort((a, b) => Number(a.id) - Number(b.id)))
    expect(r.problems).toEqual([])
    expect(r.text).toBe(`${base}\n## ADR-3: three\n\nC.\n\n## ADR-10: ten\n\nX.\n`)
  })

  it('refuses a misnamed, multi-ADR, heading-less or already-declared fragment', () => {
    const r = mergeAdrFragments(base, [
      adr('2', '## ADR-5: wrong\n'),
      adr('6', '## ADR-6: a\n\n## ADR-7: b\n'),
      adr('8', 'no heading\n'),
      adr('001', '## ADR-001: dup\n'),
    ])
    const all = r.problems.join('\n')
    expect(all).toMatch(/declares ADR-5, but the file is named for ADR-2/)
    expect(all).toMatch(/declares 2 ADRs/)
    expect(all).toMatch(/first line must be/)
    expect(all).toMatch(/ADR-001 is already declared/)
    expect(r.text).toBe(base)
  })
})

describe('fragmentIdsFromPaths', () => {
  it('reads ids from fragment file names only', () => {
    const ids = fragmentIdsFromPaths([
      'docs/ledger/rows/HYG-145.json',
      'docs/ledger/adr/ADR-1635.md',
      'docs/ledger/rows/nested/X-1.json',
      'docs/ledger/README.md',
      'docs/BUILD-BACKLOG.json',
    ])
    expect([...ids.rows]).toEqual(['HYG-145'])
    expect([...ids.adrs]).toEqual(['1635'])
  })
})

describe('loaders over a tree', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ledger-'))
    mkdirSync(path.join(dir, 'docs'), { recursive: true })
    writeFileSync(path.join(dir, 'docs/BUILD-BACKLOG.json'), JSON.stringify(doc([row('A-1')]), null, 2))
    writeFileSync(path.join(dir, 'docs/DECISIONS.md'), '# L\n\n## ADR-001: one\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads a tree with no docs/ledger directory as its base files, byte for byte', () => {
    expect(JSON.stringify(loadBacklog(dir), null, 2)).toBe(readFileSync(path.join(dir, 'docs/BUILD-BACKLOG.json'), 'utf8'))
    expect(loadDecisions(dir)).toBe('# L\n\n## ADR-001: one\n')
    expect(fragmentCount(dir)).toEqual({ n: 0, due: false })
  })

  it('merges fragments on disk, and throws on a broken one rather than reading a different list', () => {
    mkdirSync(path.join(dir, 'docs/ledger/rows'), { recursive: true })
    mkdirSync(path.join(dir, 'docs/ledger/adr'), { recursive: true })
    writeFileSync(path.join(dir, 'docs/ledger/rows/A-1.json'), JSON.stringify({ id: 'A-1', patch: { status: 'done' } }))
    writeFileSync(path.join(dir, 'docs/ledger/adr/ADR-002.md'), '## ADR-002: two\n')
    expect(loadBacklog(dir).entries[0].status).toBe('done')
    expect(loadBacklog(dir).meta.slate.waves[0].ids).toEqual([])
    expect(loadDecisions(dir)).toBe('# L\n\n## ADR-001: one\n\n## ADR-002: two\n')
    expect(readDecisionsView(dir).fragments).toHaveLength(1)
    writeFileSync(path.join(dir, 'docs/ledger/rows/B-1.json'), '{ not json')
    expect(() => loadBacklog(dir)).toThrow(/B-1\.json is not valid JSON/)
    expect(readBacklogView({ root: dir }).problems).toHaveLength(1)
  })

  it('says a compaction is due past the threshold', () => {
    mkdirSync(path.join(dir, 'docs/ledger/rows'), { recursive: true })
    for (let i = 0; i <= COMPACT_AT; i++) {
      writeFileSync(path.join(dir, `docs/ledger/rows/N-${i}.json`), JSON.stringify(row(`N-${i}`)))
    }
    expect(fragmentCount(dir)).toEqual({ n: COMPACT_AT + 1, due: true })
  })
})

describe('the real tree', () => {
  it('loads with no broken fragment, and every ADR fragment is in the merged ledger', () => {
    const view = readBacklogView()
    expect(view.problems).toEqual([])
    const adrs = readDecisionsView()
    expect(adrs.problems).toEqual([])
    for (const f of adrs.fragments) expect(adrs.text).toContain(f.text.trimEnd())
  })
})

describe('ledger:from-diff, the pure halves', () => {
  it('turns a branch that closes a row, grows its detail and files a new row into fragments', () => {
    const mb = doc([row('A-1'), row('B-1')], [{ name: 'W1 · x', ids: ['A-1', 'B-1'] }])
    const main = doc([row('A-1'), row('B-1', 'open', { priority: 'P1' }), row('C-1')], [{ name: 'W1 · x', ids: ['A-1', 'B-1', 'C-1'] }])
    const ours = doc(
      [row('A-1', 'done', { closed: '2026-09-29', detail: 'A-1 detail.\n\nCLOSED.' }), row('B-1'), row('N-1', 'open')],
      [{ name: 'W1 · x', ids: ['B-1', 'N-1'] }],
    )
    const r = rowFragmentsFromDiff({ mb, main, ours })
    expect(r.refusals).toEqual([])
    expect(r.fragments).toEqual([
      { id: 'A-1', body: { id: 'A-1', patch: { status: 'done', closed: '2026-09-29' }, append: { detail: '\n\nCLOSED.' } } },
      { id: 'N-1', body: { ...row('N-1', 'open'), wave: 'W1' } },
    ])
    // Applied to main, the fragments reproduce the branch's rows and keep main's own change.
    const applied = applyRowFragments(main, r.fragments.map((f) => frag(f.id, f.body)))
    expect(applied.problems).toEqual([])
    const by = new Map(applied.doc.entries.map((e: Row) => [e.id, e]))
    expect(by.get('A-1')).toEqual(ours.entries[0])
    expect(by.get('B-1').priority).toBe('P1')
    expect(applied.doc.meta.slate.waves[0].ids).toEqual(['B-1', 'C-1', 'N-1'])
  })

  it('refuses what a fragment cannot carry: a key both sides changed, a meta edit, a deleted row', () => {
    const mb = doc([row('A-1'), row('B-1')])
    const main = doc([row('A-1', 'open', { title: 'main title' }), row('B-1')])
    const ours = { ...doc([row('A-1', 'open', { title: 'our title' })]), meta: { slate: { waves: [] }, note: 'x' } }
    const all = rowFragmentsFromDiff({ mb, main, ours }).refusals.join('\n')
    expect(all).toMatch(/row A-1: both this branch and main changed "title"/)
    expect(all).toMatch(/changed something outside the rows/)
    expect(all).toMatch(/deletes row B-1/)
  })

  it('turns new ADRs into fragments and refuses an ADR edited in place', () => {
    const mb = '# L\n\n## ADR-001: one\n\nBody.\n'
    const main = `${mb}\n## ADR-002: main's\n`
    const ours = `${mb}\n## ADR-003: ours\n\nNew.\n`
    const r = adrFragmentsFromDiff({ mb, main, ours })
    expect(r.refusals).toEqual([])
    expect(r.fragments).toEqual([{ id: '003', text: '## ADR-003: ours\n\nNew.\n' }])
    const edited = adrFragmentsFromDiff({ mb, main, ours: mb.replace('Body.', 'Changed.') })
    expect(edited.refusals.join('\n')).toMatch(/ADR-001 is edited in place/)
  })
})
