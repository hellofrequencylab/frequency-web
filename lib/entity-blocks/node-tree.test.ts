import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  NODE_ID_RE,
  allNodes,
  benchLoss,
  benchSeed,
  nodeIdFor,
  placedSeed,
  upgradeLayout,
  type NodeLayout,
} from './node-tree'
import { entityBlockById } from './registry'

// THE FROZEN CORPUS. Every assertion below that matters runs over the real production shapes, not
// over examples chosen to make the function look right. See scripts/entity-layout-corpus.json.
type CorpusDoc = {
  id: string
  store: string
  kind: string
  rows: Array<{
    id: string
    columns: number
    cells: string[][]
    title?: string
    headerOn?: boolean
    ratio?: string
    mt?: string
    mb?: string
  }>
  contentKeys: Record<string, string[]>
  styleKeys: Record<string, string[]>
  hidden: string[]
}
const CORPUS: { documents: CorpusDoc[] } = JSON.parse(readFileSync('scripts/entity-layout-corpus.json', 'utf8'))

/** Rehydrate a corpus skeleton into a document shaped exactly like the stored jsonb. Field VALUES are
 *  not in the corpus (they are tenant copy), so each field gets a marker naming its own key — which is
 *  what makes "did the bag survive, intact, on the right node" checkable. */
function rehydrate(d: CorpusDoc): Record<string, unknown> {
  const bag = (fields: string[], type: string) => Object.fromEntries(fields.map((f) => [f, `${type}.${f}`]))
  const doc: Record<string, unknown> = { rows: d.rows.map((r) => ({ ...r })) }
  if (Object.keys(d.contentKeys).length) {
    doc.content = Object.fromEntries(Object.entries(d.contentKeys).map(([t, f]) => [t, bag(f, t)]))
  }
  if (Object.keys(d.styleKeys).length) {
    doc.style = Object.fromEntries(Object.entries(d.styleKeys).map(([t, f]) => [t, bag(f, t)]))
  }
  if (d.hidden.length) doc.hidden = [...d.hidden]
  return doc
}

const DOCS = CORPUS.documents.map((d) => ({ meta: d, raw: rehydrate(d) }))

describe('the frozen corpus', () => {
  // MIN floors, the MIN_CORPUS_FILES lesson: "the thing I measure disappeared" must never be
  // spelled the same way as "the debt disappeared". A truncated corpus fails here, loudly.
  it('holds every production EntityLayout document, across every store that has one', () => {
    expect(DOCS.length).toBe(37)
    expect(new Set(CORPUS.documents.map((d) => d.store)).size).toBe(3)
  })

  it('still describes the bench, which is the reason it exists', () => {
    // 34 content bags + 1 style bag, on 4 types, that no cell references. If this drops to zero the
    // corpus was recaptured after a fix — or recaptured wrong. Either way, look before editing it.
    const benched: string[] = []
    for (const d of CORPUS.documents) {
      const placed = new Set(d.rows.flatMap((r) => r.cells.flat()))
      for (const [t, f] of Object.entries(d.contentKeys)) if (f.length && !placed.has(t)) benched.push(t)
      for (const [t, f] of Object.entries(d.styleKeys)) if (f.length && !placed.has(t)) benched.push(t)
    }
    expect(benched.length).toBe(35)
    expect([...new Set(benched)].sort()).toEqual(['about', 'cardGrid', 'heading', 'story'])
  })
})

describe('nodeIdFor', () => {
  it('always mints an id that matches NODE_ID_RE', () => {
    for (let i = 0; i < 500; i++) expect(NODE_ID_RE.test(nodeIdFor(`seed-${i}`))).toBe(true)
    for (const s of ['', ' ', '0', 'a'.repeat(4096), '{}', '__proto__']) {
      expect(NODE_ID_RE.test(nodeIdFor(s))).toBe(true)
    }
  })

  it('is deterministic — the same seed is the same id, every call', () => {
    expect(nodeIdFor('r0:0:0:about')).toBe(nodeIdFor('r0:0:0:about'))
    expect(nodeIdFor('r0:0:0:about')).not.toBe(nodeIdFor('r0:0:1:about'))
  })

  it('avoids a taken id deterministically rather than by retrying with randomness', () => {
    const seed = 'r0:0:0:about'
    const first = nodeIdFor(seed)
    const second = nodeIdFor(seed, new Set([first]))
    expect(second).not.toBe(first)
    expect(nodeIdFor(seed, new Set([first]))).toBe(second)
    expect(NODE_ID_RE.test(second)).toBe(true)
  })

  it('does not collide across every seed the corpus produces', () => {
    const seeds: string[] = []
    for (const { meta } of DOCS) {
      for (const row of meta.rows) {
        row.cells.forEach((stack, col) => stack.forEach((t, i) => seeds.push(placedSeed(row.id, col, i, t))))
      }
      for (const t of Object.keys(meta.contentKeys)) seeds.push(benchSeed(t))
    }
    expect(new Set(seeds.map((s) => nodeIdFor(s))).size).toBe(new Set(seeds).size)
  })
})

describe('upgradeLayout', () => {
  it('is total — anything unusable reads as "no saved layout", never a throw', () => {
    for (const bad of [null, undefined, 0, '', 'rows', [], true, NaN]) {
      expect(upgradeLayout(bad)).toBeNull()
    }
    // A plain object with nothing recognisable is an EMPTY tree, not null: `parseEntityLayout`
    // makes the same distinction, and a caller needs "there is a document, it holds nothing".
    expect(upgradeLayout({})).toEqual({ rows: [], bench: [] })
    expect(upgradeLayout({ rows: 'nope', content: 7, hidden: {} })).toEqual({ rows: [], bench: [] })
  })

  it('is idempotent over every production document', () => {
    for (const { meta, raw } of DOCS) {
      const once = upgradeLayout(raw)
      const twice = upgradeLayout(once)
      expect(twice, meta.id).toEqual(once)
      // ...and a third pass, because an idempotence bug that skips a generation exists.
      expect(upgradeLayout(twice), meta.id).toEqual(once)
    }
  })

  it('is deterministic over every production document — two independent runs agree', () => {
    for (const { meta, raw } of DOCS) {
      expect(upgradeLayout(rehydrate(meta)), meta.id).toEqual(upgradeLayout(raw))
    }
  })

  it('mints a unique, well-formed nid for every node in every document', () => {
    for (const { meta, raw } of DOCS) {
      const nodes = allNodes(upgradeLayout(raw) as NodeLayout)
      expect(nodes.length, meta.id).toBeGreaterThan(0)
      for (const n of nodes) expect(NODE_ID_RE.test(n.nid), `${meta.id} ${n.type} ${n.nid}`).toBe(true)
      expect(new Set(nodes.map((n) => n.nid)).size, meta.id).toBe(nodes.length)
    }
  })

  // THE ASSERTION THIS MODULE EXISTS FOR.
  it('loses NOTHING: every authored bag in every production document lands on a node', () => {
    for (const { meta, raw } of DOCS) {
      expect(benchLoss(raw, upgradeLayout(raw)), meta.id).toEqual([])
    }
  })

  it('benches the 35 bags no cell references, rather than deleting them', () => {
    let benched = 0
    for (const { raw } of DOCS) {
      const tree = upgradeLayout(raw) as NodeLayout
      benched += tree.bench.filter((n) => n.content || n.style).length
    }
    expect(benched).toBe(35)
  })

  it('carries a bag onto the node that owns it, with its fields intact', () => {
    const raw = {
      rows: [{ id: 'r0', columns: 1, cells: [['heading']] }],
      content: { heading: { text: 'Hello' }, story: { body: 'Benched' } },
      style: { heading: { align: 'center' } },
    }
    const tree = upgradeLayout(raw) as NodeLayout
    const placed = tree.rows[0].cells[0][0]
    expect(placed.type).toBe('heading')
    expect(placed.content).toEqual({ text: 'Hello' })
    expect(placed.style).toEqual({ align: 'center' })
    expect(tree.bench).toHaveLength(1)
    expect(tree.bench[0]).toMatchObject({ type: 'story', content: { body: 'Benched' } })
  })

  it('turns the document-level hidden set into a per-node flag', () => {
    const tree = upgradeLayout({
      rows: [{ id: 'r0', columns: 1, cells: [['heading', 'text']] }],
      hidden: ['text', 'story'],
    }) as NodeLayout
    expect(tree.rows[0].cells[0].map((n) => [n.type, n.hidden ?? false])).toEqual([
      ['heading', false],
      ['text', true],
    ])
    // A hidden id with no placement is still author intent, so it becomes a hidden BENCH node
    // rather than a silent deletion. `deriveBench` excludes it today, so today it is nowhere.
    expect(tree.bench).toEqual([{ nid: expect.stringMatching(NODE_ID_RE), type: 'story', hidden: true }])
  })

  it('makes two blocks of one type expressible, and gives the shared bag to the first only', () => {
    const tree = upgradeLayout({
      rows: [{ id: 'r0', columns: 1, cells: [['text', 'text']] }],
      content: { text: { text: 'once' } },
    }) as NodeLayout
    const [a, b] = tree.rows[0].cells[0]
    expect(a.nid).not.toBe(b.nid)
    expect(a.content).toEqual({ text: 'once' })
    // NOT cloned. One stored bag is one author's paragraph; copying it into a second block would
    // invent content nobody wrote.
    expect(b.content).toBeUndefined()
  })

  it('preserves a block type the registry no longer knows (ADR-978)', () => {
    const tree = upgradeLayout({
      rows: [{ id: 'r0', columns: 1, cells: [['heading', 'retiredBlock']] }],
      content: { retiredBlock: { text: 'still here' } },
    }) as NodeLayout
    expect(entityBlockById('retiredBlock')).toBeNull()
    expect(tree.rows[0].cells[0].map((n) => n.type)).toEqual(['heading', 'retiredBlock'])
    expect(tree.rows[0].cells[0][1].content).toEqual({ text: 'still here' })
  })

  it('reads the legacy pre-rows shapes rather than discarding them', () => {
    const fromOrder = upgradeLayout({ order: ['heading', 'text'] }) as NodeLayout
    expect(fromOrder.rows[0].cells[0].map((n) => n.type)).toEqual(['heading', 'text'])
    const fromSlots = upgradeLayout({ slots: { main: ['heading'], side: ['text'] } }) as NodeLayout
    expect(fromSlots.rows[0].cells[0].map((n) => n.type)).toEqual(['heading', 'text'])
    // The per-row legacy `slots` (one entry per column) too.
    const rowSlots = upgradeLayout({ rows: [{ id: 'r0', columns: 2, slots: ['heading', null] }] }) as NodeLayout
    expect(rowSlots.rows[0].cells).toEqual([[expect.objectContaining({ type: 'heading' })], []])
  })

  it('holds the same bounds the current parser does', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, columns: 1, cells: [['text']] }))
    expect((upgradeLayout({ rows }) as NodeLayout).rows).toHaveLength(24)
    const deep = { rows: [{ id: 'r0', columns: 1, cells: [Array.from({ length: 30 }, () => 'text')] }] }
    expect((upgradeLayout(deep) as NodeLayout).rows[0].cells[0]).toHaveLength(12)
    // A row whose `columns` is not 1-4 is dropped, exactly as parseRows drops it.
    expect((upgradeLayout({ rows: [{ id: 'r0', columns: 9, cells: [['text']] }] }) as NodeLayout).rows).toEqual([])
    // cells.length === columns, always.
    const wide = upgradeLayout({ rows: [{ id: 'r0', columns: 3, cells: [['text']] }] }) as NodeLayout
    expect(wide.rows[0].cells).toHaveLength(3)
  })

  it('never lets a user-supplied string become a node id', () => {
    const tree = upgradeLayout({
      rows: [{ id: 'r0', columns: 1, cells: [[{ nid: '__proto__', type: 'heading' }]] }],
    }) as NodeLayout
    const nid = tree.rows[0].cells[0][0].nid
    expect(nid).not.toBe('__proto__')
    expect(NODE_ID_RE.test(nid)).toBe(true)
  })
})
