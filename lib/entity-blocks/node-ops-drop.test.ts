import { describe, it, expect } from 'vitest'
import type { NodeLayout } from './node-tree'
import { dropMoveTarget, moveNodeTo, sanitizeNodeLayout } from './node-ops'

// PROG-E6H: where a DRAGGED block lands in the Space page builder. A drop names a place as a drag sees it
// (before the block now at that index, counted with the dragged block still in its column); the rule
// answers where the block ends up, or null when nothing may move.

const A = 'naaaaaaaaa1', B = 'nbbbbbbbbb1', C = 'nccccccccc1', D = 'nddddddddd1', ALONE = 'nalone00001'
const page = (): NodeLayout => ({
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: ALONE, type: 'editorial' }]] },
    {
      id: 'r1',
      columns: 2,
      cells: [
        [{ nid: A, type: 'text', content: { text: 'First words' } }, { nid: B, type: 'callout' }, { nid: C, type: 'text' }],
        [{ nid: D, type: 'events' }],
      ],
    },
    { id: 'r2', columns: 2, cells: [[], []] },
  ],
  bench: [],
})
const ids = (layout: NodeLayout, row: number) => layout.rows[row].cells.map((stack) => stack.map((n) => n.nid))

describe('a drop inside the block’s own column', () => {
  it('lands before the tile it was dropped on, above or below where it started', () => {
    expect(ids(moveNodeTo(page(), C, { rowId: 'r1', col: 0, index: 0 }), 1)[0]).toEqual([C, A, B])
    expect(ids(moveNodeTo(page(), C, { rowId: 'r1', col: 0, index: 1 }), 1)[0]).toEqual([A, C, B])
    expect(ids(moveNodeTo(page(), A, { rowId: 'r1', col: 0, index: 2 }), 1)[0]).toEqual([B, A, C])
  })
  it('lands at the end when dropped on the column itself', () => {
    expect(ids(moveNodeTo(page(), A, { rowId: 'r1', col: 0, index: 3 }), 1)[0]).toEqual([B, C, A])
  })
  it('moves nothing when dropped on the place it already has', () => {
    const start = page()
    expect(dropMoveTarget([{ id: 'r1', cells: [[A, B, C], [D]] }], A, { rowId: 'r1', col: 0, index: 0 })).toBeNull()
    expect(dropMoveTarget([{ id: 'r1', cells: [[A, B, C], [D]] }], A, { rowId: 'r1', col: 0, index: 1 })).toBeNull()
    expect(moveNodeTo(start, C, { rowId: 'r1', col: 0, index: 3 })).toBe(start)
    expect(moveNodeTo(start, B, { rowId: 'r1', col: 0, index: 2 })).toBe(start)
  })
})

describe('a drop in another column of the same section', () => {
  it('lands at the place dropped on, with its words', () => {
    const moved = moveNodeTo(page(), A, { rowId: 'r1', col: 1, index: 0 })
    expect(ids(moved, 1)).toEqual([[B, C], [A, D]])
    expect(moved.rows[1].cells[1][0].content).toEqual({ text: 'First words' })
    expect(ids(moveNodeTo(page(), A, { rowId: 'r1', col: 1, index: 1 }), 1)).toEqual([[B, C], [D, A]])
  })
  it('fills an empty column', () => {
    const emptied = moveNodeTo(page(), D, { rowId: 'r1', col: 0, index: 3 })
    expect(ids(emptied, 1)).toEqual([[A, B, C, D], []])
    expect(ids(moveNodeTo(emptied, B, { rowId: 'r1', col: 1, index: 0 }), 1)).toEqual([[A, C, D], [B]])
  })
  it('refuses a column at the 12 block cap, as the Move button does, and drops nothing', () => {
    const full = page()
    full.rows[1].cells[1] = Array.from({ length: 12 }, (_, i) => ({ nid: `nfull${String(i).padStart(6, '0')}`, type: 'text' }))
    expect(moveNodeTo(full, A, { rowId: 'r1', col: 1, index: 0 })).toBe(full)
    expect(moveNodeTo(full, A, { rowId: 'r1', col: 1, index: 12 })).toBe(full)
    // A reorder inside the full column is still a move: it adds nothing to the column.
    const inside = moveNodeTo(full, 'nfull000011', { rowId: 'r1', col: 1, index: 0 })
    expect(ids(inside, 1)[1][0]).toBe('nfull000011')
    expect(ids(inside, 1)[1]).toHaveLength(12)
  })
  it('keeps a live data section at its cap of one through the Space write guard', () => {
    const stored = sanitizeNodeLayout(moveNodeTo(page(), D, { rowId: 'r1', col: 0, index: 1 }), 'space')!
    expect(stored.rows[1].cells.map((stack) => stack.map((n) => n.type))).toEqual([['text', 'events', 'callout', 'text'], []])
  })
})

describe('a drop that is not a place in the block’s section', () => {
  it('refuses another section, a column that does not exist, an unknown block and a broken index', () => {
    const start = page()
    expect(moveNodeTo(start, A, { rowId: 'r2', col: 0, index: 0 })).toBe(start)
    expect(moveNodeTo(start, ALONE, { rowId: 'r1', col: 1, index: 0 })).toBe(start)
    expect(moveNodeTo(start, A, { rowId: 'r1', col: 2, index: 0 })).toBe(start)
    expect(moveNodeTo(start, A, { rowId: 'r1', col: 1, index: -1 })).toBe(start)
    expect(moveNodeTo(start, 'nnotthere01', { rowId: 'r1', col: 1, index: 0 })).toBe(start)
  })
  it('answers for the type-keyed store through the same rule', () => {
    const rows = [{ id: 'r1', cells: [['text', 'callout'], []] }]
    expect(dropMoveTarget(rows, 'callout', { rowId: 'r1', col: 0, index: 0 })).toEqual({ rowId: 'r1', col: 0, index: 0 })
    expect(dropMoveTarget(rows, 'text', { rowId: 'r1', col: 1, index: 0 })).toEqual({ rowId: 'r1', col: 1, index: 0 })
  })
})
