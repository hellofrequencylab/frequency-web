import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { NODE_ID_RE, upgradeLayout, allNodes, type NodeLayout, type BlockNode } from './node-tree'
import { entityBlockById } from './registry'
import {
  addNode,
  benchNode,
  canPlaceType,
  countPlaced,
  findNode,
  genNodeId,
  getNode,
  hideNode,
  normalizeNodeLayout,
  nudgeNode,
  placeNode,
  removeNode,
  resolveNodeRows,
  sanitizeNodeLayout,
  setNodeContent,
  setNodeStyle,
  unhideNode,
  type ResolvedNodeRow,
} from './node-ops'

// E0 task 11 (docs/EDITOR-E0.md §1.5 steps 5 and 8). Three properties are proven here: every op is
// immutable and total; a node's bags travel WITH it (bench, move, delete); and the write guard rewrites a
// known node's bag through its own field sanitizer while an unknown type round-trips byte-for-byte
// (ADR-978). The frozen corpus at the bottom proves the guard loses nothing on the real shapes.

const node = (nid: string, type: string, extra: Partial<BlockNode> = {}): BlockNode => ({ nid, type, ...extra })

function base(): NodeLayout {
  return {
    rows: [
      { id: 'r0', columns: 1, cells: [[node('naaaaaaaaa1', 'text', { content: { text: 'first words' } })]] },
      {
        id: 'r1',
        columns: 2,
        cells: [
          [node('naaaaaaaaa2', 'text', { content: { text: 'second words' } }), node('naaaaaaaaa3', 'offerings')],
          [node('naaaaaaaaa4', 'heading', { content: { text: 'Hi' }, style: { align: 'center' } })],
        ],
      },
    ],
    bench: [node('naaaaaaaaa5', 'about', { content: { body: 'benched story' } })],
  }
}

const cellsOf = (l: NodeLayout) => l.rows.map((r) => r.cells.map((s) => s.map((n) => n.nid)))

describe('genNodeId', () => {
  it('mints a NODE_ID_RE id that avoids collisions', () => {
    const id = genNodeId(['naaaaaaaaa1'])
    expect(id).toMatch(NODE_ID_RE)
    expect(id).not.toBe('naaaaaaaaa1')
  })
})

describe('normalizeNodeLayout', () => {
  it('is idempotent and leaves a well-formed layout alone', () => {
    const once = normalizeNodeLayout(base())
    expect(once).toEqual(base())
    expect(normalizeNodeLayout(once)).toEqual(once)
  })

  it('re-mints a missing or duplicate nid deterministically, fixes columns and drops over-cap data blocks', () => {
    const dirty = {
      rows: [
        { id: 'r0', columns: 9, cells: [[{ type: 'offerings' }, { nid: 'naaaaaaaaa1', type: 'offerings' }]] },
        { id: 'bad id', columns: 2, cells: [[{ nid: 'naaaaaaaaa1', type: 'text' }]] },
      ],
      bench: [{ type: 'about' }, { nid: 'not-a-nid', type: 'story' }],
    } as unknown as NodeLayout
    const out = normalizeNodeLayout(dirty)
    expect(out.rows[0].columns).toBe(1)
    expect(out.rows[0].cells[0].map((n) => n.type)).toEqual(['offerings']) // the second offerings is refused
    expect(out.rows[1].id).toBe('r1')
    expect(out.rows[1].cells).toHaveLength(2)
    const ids = allNodes(out).map((n) => n.nid)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(NODE_ID_RE)
    expect(normalizeNodeLayout(dirty)).toEqual(out)
  })

  it('keeps an unknown type in place (ADR-978) and does not count the bench toward a cap', () => {
    const l: NodeLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [[node('naaaaaaaaa1', 'retiredBlock', { content: { x: 1 } }), node('naaaaaaaaa2', 'offerings')]] }],
      bench: [node('naaaaaaaaa3', 'offerings')],
    }
    const out = normalizeNodeLayout(l)
    expect(out.rows[0].cells[0].map((n) => n.type)).toEqual(['retiredBlock', 'offerings'])
    expect(out.rows[0].cells[0][0].content).toEqual({ x: 1 })
    expect(out.bench.map((n) => n.type)).toEqual(['offerings'])
  })
})

describe('addresses: findNode / getNode / counts', () => {
  it('finds placed and benched nodes, and nothing for a stranger', () => {
    expect(findNode(base(), 'naaaaaaaaa3')).toEqual({ where: 'placed', rowId: 'r1', col: 0, index: 1 })
    expect(findNode(base(), 'naaaaaaaaa5')).toEqual({ where: 'bench', index: 0 })
    expect(findNode(base(), 'nzzzzzzzzz9')).toBeNull()
    expect(getNode(base(), 'naaaaaaaaa5')?.content).toEqual({ body: 'benched story' })
  })

  it('counts placed nodes per type and answers the cap', () => {
    expect(countPlaced(base(), 'text')).toBe(2)
    expect(canPlaceType(base(), 'text')).toBe(true)
    expect(canPlaceType(base(), 'offerings')).toBe(false)
    expect(canPlaceType(base(), 'about')).toBe(true) // benched, not placed
  })
})

describe('addNode', () => {
  it('adds a second Text with its own id and refuses a second Offerings and an unknown type', () => {
    const { layout, nid } = addNode(base(), 'text', 'r0', 0)
    expect(nid).toMatch(NODE_ID_RE)
    expect(layout.rows[0].cells[0].map((n) => n.type)).toEqual(['text', 'text'])
    expect(layout.rows[0].cells[0][1].content).toBeUndefined() // a NEW node starts empty, it does not clone
    expect(addNode(base(), 'offerings', 'r0', 0)).toEqual({ layout: base(), nid: null })
    expect(addNode(base(), 'nope', 'r0', 0)).toEqual({ layout: base(), nid: null })
    expect(addNode(base(), 'text', 'r9', 0)).toEqual({ layout: base(), nid: null })
    expect(addNode(base(), 'text', 'r0', 3)).toEqual({ layout: base(), nid: null })
  })
})

describe('placeNode / nudgeNode / benchNode', () => {
  it('moves one of two Text nodes without touching the other, bag intact', () => {
    const out = placeNode(base(), 'naaaaaaaaa2', 'r0', 0, 0)
    expect(cellsOf(out)).toEqual([[['naaaaaaaaa2', 'naaaaaaaaa1']], [['naaaaaaaaa3'], ['naaaaaaaaa4']]])
    expect(out.rows[0].cells[0][0].content).toEqual({ text: 'second words' })
    expect(out.rows[0].cells[0][1].content).toEqual({ text: 'first words' })
  })

  it('places a benched node back onto the page with its bag, and a data block move never trips its own cap', () => {
    const out = placeNode(base(), 'naaaaaaaaa5', 'r1', 1)
    expect(out.bench).toEqual([])
    expect(out.rows[1].cells[1].map((n) => n.nid)).toEqual(['naaaaaaaaa4', 'naaaaaaaaa5'])
    expect(getNode(out, 'naaaaaaaaa5')?.content).toEqual({ body: 'benched story' })
    const moved = placeNode(base(), 'naaaaaaaaa3', 'r0', 0)
    expect(countPlaced(moved, 'offerings')).toBe(1)
  })

  it('nudges within a stack and is a no-op at the ends, on the bench, or for a stranger', () => {
    const down = nudgeNode(base(), 'naaaaaaaaa2', 1)
    expect(down.rows[1].cells[0].map((n) => n.nid)).toEqual(['naaaaaaaaa3', 'naaaaaaaaa2'])
    expect(nudgeNode(base(), 'naaaaaaaaa2', -1)).toEqual(base())
    expect(nudgeNode(base(), 'naaaaaaaaa5', 1)).toEqual(base())
    expect(nudgeNode(base(), 'nzzzzzzzzz9', 1)).toEqual(base())
  })

  it('benches a node WITH its content and style, and the bench is stored', () => {
    const out = benchNode(base(), 'naaaaaaaaa4')
    expect(out.rows[1].cells[1]).toEqual([])
    expect(out.bench.map((n) => n.nid)).toEqual(['naaaaaaaaa5', 'naaaaaaaaa4'])
    expect(out.bench[1]).toEqual(node('naaaaaaaaa4', 'heading', { content: { text: 'Hi' }, style: { align: 'center' } }))
    expect(benchNode(out, 'naaaaaaaaa4')).toEqual(out)
  })
})

describe('hideNode / unhideNode / removeNode / bags', () => {
  it('hides ONE node of a type, not every node of that type', () => {
    const out = hideNode(base(), 'naaaaaaaaa2')
    expect(getNode(out, 'naaaaaaaaa2')?.hidden).toBe(true)
    expect(getNode(out, 'naaaaaaaaa1')?.hidden).toBeUndefined()
    expect(unhideNode(out, 'naaaaaaaaa2')).toEqual(base())
    expect(hideNode(out, 'naaaaaaaaa2')).toEqual(out)
  })

  it('removes a node and its bag, placed or benched; a stranger is a no-op', () => {
    const out = removeNode(base(), 'naaaaaaaaa1')
    expect(out.rows[0].cells).toEqual([[]])
    expect(getNode(out, 'naaaaaaaaa1')).toBeNull()
    expect(removeNode(base(), 'naaaaaaaaa5').bench).toEqual([])
    expect(removeNode(base(), 'nzzzzzzzzz9')).toEqual(base())
  })

  it('sets and clears content and style on exactly one node', () => {
    const out = setNodeContent(base(), 'naaaaaaaaa2', { text: 'rewritten' })
    expect(getNode(out, 'naaaaaaaaa2')?.content).toEqual({ text: 'rewritten' })
    expect(getNode(out, 'naaaaaaaaa1')?.content).toEqual({ text: 'first words' })
    expect(getNode(setNodeContent(out, 'naaaaaaaaa2', {}), 'naaaaaaaaa2')?.content).toBeUndefined()
    const styled = setNodeStyle(base(), 'naaaaaaaaa5', { pad: 'lg' })
    expect(getNode(styled, 'naaaaaaaaa5')?.style).toEqual({ pad: 'lg' })
    expect(getNode(setNodeStyle(styled, 'naaaaaaaaa5', undefined), 'naaaaaaaaa5')?.style).toBeUndefined()
    expect(setNodeContent(base(), 'nzzzzzzzzz9', { body: 'x' })).toEqual(base())
  })

  it('never mutates its input', () => {
    const input = base()
    const snapshot = JSON.stringify(input)
    placeNode(input, 'naaaaaaaaa2', 'r0', 0)
    benchNode(input, 'naaaaaaaaa4')
    removeNode(input, 'naaaaaaaaa1')
    hideNode(input, 'naaaaaaaaa2')
    setNodeContent(input, 'naaaaaaaaa2', { body: 'changed' })
    addNode(input, 'text', 'r0', 0)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe('sanitizeNodeLayout (the write guard)', () => {
  it('rewrites a known node bag through its field sanitizer and preserves an unknown type verbatim', () => {
    const raw = {
      rows: [
        {
          id: 'r0',
          columns: 1,
          cells: [
            [
              { nid: 'naaaaaaaaa1', type: 'text', content: { text: 'keep <b>bold</b>', __proto__x: 'drop me', notAField: 'drop me' }, style: { pad: 'lg', bogus: 1 } },
              { nid: 'naaaaaaaaa2', type: 'retiredBlock', content: { anything: { nested: true } }, style: { pad: 'weird' } },
              { nid: 'naaaaaaaaa3', type: 'topfriends' },
            ],
          ],
        },
      ],
      bench: [{ nid: 'naaaaaaaaa4', type: 'about', content: { body: 'benched', nope: 1 } }],
    }
    const out = sanitizeNodeLayout(raw, 'space')!
    const [text, unknown] = out.rows[0].cells[0]
    expect(out.rows[0].cells[0]).toHaveLength(2) // topfriends is member-only: dropped for a space
    expect(text.content).toEqual({ text: 'keep <b>bold</b>' })
    expect(text.style).toEqual({ pad: 'lg' })
    expect(unknown).toEqual(raw.rows[0].cells[0][1])
    expect(out.bench[0].content).toEqual({ body: 'benched' })
  })

  it('reads a LEGACY type-keyed document too, giving each placement its bag', () => {
    const legacy = {
      rows: [{ id: 'r0', columns: 1, cells: [['about', 'text']] }],
      content: { about: { body: 'who we are' }, text: { text: 'a paragraph' }, story: { body: 'orphan' } },
      hidden: ['text'],
    }
    const out = sanitizeNodeLayout(legacy, 'space')!
    expect(out.rows[0].cells[0].map((n) => [n.type, n.content?.body ?? n.content?.text, n.hidden])).toEqual([
      ['about', 'who we are', undefined],
      ['text', 'a paragraph', true],
    ])
    expect(out.bench.map((n) => [n.type, n.content?.body])).toEqual([['story', 'orphan']])
  })

  it('folds a too-wide row onto the kind maximum instead of dropping the overflow nodes', () => {
    const out = sanitizeNodeLayout(
      { rows: [{ id: 'r0', columns: 3, cells: [[{ type: 'links' }], [{ type: 'text' }], [{ type: 'heading' }]] }], bench: [] },
      'member',
    )!
    expect(out.rows[0].columns).toBe(1)
    expect(out.rows[0].cells[0].map((n) => n.type)).toEqual(['links', 'text', 'heading'])
  })

  it('holds the per-type cap and returns null when nothing survives', () => {
    const out = sanitizeNodeLayout({ rows: [{ id: 'r0', columns: 1, cells: [[{ type: 'offerings' }, { type: 'offerings' }, { type: 'text' }, { type: 'text' }]] }] }, 'space')!
    expect(out.rows[0].cells[0].map((n) => n.type)).toEqual(['offerings', 'text', 'text'])
    expect(sanitizeNodeLayout({ rows: [], bench: [] }, 'space')).toBeNull()
    expect(sanitizeNodeLayout('garbage', 'space')).toBeNull()
    expect(sanitizeNodeLayout({ rows: [{ id: 'r0', columns: 1, cells: [[]] }] }, 'space')?.rows).toHaveLength(1)
  })

  it('is idempotent over its own output', () => {
    const once = sanitizeNodeLayout(base(), 'space')!
    expect(sanitizeNodeLayout(once, 'space')).toEqual(once)
  })
})

describe('resolveNodeRows (the render resolver)', () => {
  it('skips hidden, unknown and wrong-kind nodes and never renders the bench', () => {
    const l: NodeLayout = {
      rows: [
        {
          id: 'r0',
          columns: 2,
          cells: [
            [node('naaaaaaaaa1', 'text', { hidden: true }), node('naaaaaaaaa2', 'retiredBlock'), node('naaaaaaaaa3', 'text')],
            [node('naaaaaaaaa4', 'topfriends'), node('naaaaaaaaa6', 'offerings'), node('naaaaaaaaa7', 'offerings')],
          ],
        },
      ],
      bench: [node('naaaaaaaaa5', 'about')],
    }
    const rows: ResolvedNodeRow[] = resolveNodeRows(l, 'space')
    expect(rows.map((r) => r.cells.map((s) => s.map((n) => n.nid)))).toEqual([[['naaaaaaaaa3'], ['naaaaaaaaa6']]])
    expect(resolveNodeRows(null, 'space')).toEqual([])
  })

  it('folds a space row wider than two columns and carries the row meta', () => {
    const l: NodeLayout = {
      rows: [{ id: 'r0', columns: 3, cells: [[node('naaaaaaaaa1', 'text')], [node('naaaaaaaaa2', 'text')], [node('naaaaaaaaa3', 'text')]], title: 'Three', headerOn: true, mt: 'md' }],
      bench: [],
    }
    const [row] = resolveNodeRows(l, 'space')
    expect(row.columns).toBe(2)
    expect(row.cells.map((s) => s.length)).toEqual([1, 2])
    expect(row).toMatchObject({ title: 'Three', headerOn: true, mt: 'md' })
  })
})

describe('over the frozen corpus (scripts/entity-layout-corpus.json)', () => {
  type CorpusDoc = { id: string; kind: string; rows: Array<Record<string, unknown>>; contentKeys: Record<string, string[]>; styleKeys: Record<string, string[]>; hidden: string[] }
  const CORPUS: { documents: CorpusDoc[] } = JSON.parse(readFileSync('scripts/entity-layout-corpus.json', 'utf8'))

  it('the write guard keeps every node identity the upgrade minted, on every document', () => {
    expect(CORPUS.documents.length).toBeGreaterThan(30)
    for (const d of CORPUS.documents) {
      const raw = { rows: d.rows, hidden: d.hidden }
      const kind = d.kind as 'member' | 'space' | 'email'
      const up = upgradeLayout(raw)!
      const clean = sanitizeNodeLayout(raw, kind)
      // Every node the upgrade minted that the kind permits survives sanitize under the SAME nid.
      const kept = new Set(clean ? allNodes(clean).map((n) => n.nid) : [])
      for (const n of allNodes(up)) {
        const block = entityBlockById(n.type)
        const permitted = block === null || (block.kinds as readonly string[]).includes(kind)
        if (permitted) expect(kept.has(n.nid), `${d.id} ${n.type} ${n.nid}`).toBe(true)
      }
    }
  })
})
