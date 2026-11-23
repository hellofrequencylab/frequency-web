import { describe, it, expect } from 'vitest'
import type { BlockNode, NodeLayout } from './node-tree'
import { columnMoveTarget, moveNodeAcross, normalizeNodeLayout, sanitizeNodeLayout } from './node-ops'
import { entityBlockLimit } from './block-limits'

// PROG-E6G: a block moves one column over inside its own section. The rule is the website Layers one
// (the end of the neighbouring column); these prove every edge of it on the Space page's node document.

const node = (nid: string, type: string, extra: Partial<BlockNode> = {}): BlockNode => ({ nid, type, ...extra })
const A = 'naaaaaaaaa1', B = 'nbbbbbbbbb2', C = 'nccccccccc3', D = 'nddddddddd4', E = 'neeeeeeeee5'

function page(): NodeLayout {
  return {
    rows: [
      { id: 'r0', columns: 1, cells: [[node(A, 'text', { content: { text: 'alone' } })]] },
      {
        id: 'r1',
        columns: 2,
        ratio: 'lead',
        cells: [
          [node(B, 'text', { content: { text: 'left words' }, style: { align: 'center' } as never }), node(C, 'callout')],
          [node(D, 'events', { content: { title: 'Coming up' } })],
        ],
      },
      { id: 'r2', columns: 3, cells: [[node(E, 'editorial')], [], []] },
    ],
    bench: [node('nbench00001', 'gallery')],
  }
}
const ids = (layout: NodeLayout, rowId: string) => layout.rows.find((r) => r.id === rowId)!.cells.map((stack) => stack.map((n) => n.nid))

describe('moveNodeAcross', () => {
  it('sends a block to the END of the column on the right, with its words and style', () => {
    const before = page()
    const after = moveNodeAcross(before, B, 1)
    expect(ids(after, 'r1')).toEqual([[C], [D, B]])
    expect(after.rows[1].cells[1][1]).toEqual(before.rows[1].cells[0][0])
    expect(after.rows[1].ratio).toBe('lead')
    // The input is never mutated, and the result already holds every invariant.
    expect(before).toEqual(page())
    expect(normalizeNodeLayout(after)).toEqual(after)
  })

  it('sends a block to the end of the column on the left', () => {
    expect(ids(moveNodeAcross(page(), D, -1), 'r1')).toEqual([[B, C, D], []])
  })

  it('stops at the first and the last column', () => {
    const layout = page()
    expect(moveNodeAcross(layout, B, -1)).toBe(layout)
    expect(moveNodeAcross(layout, D, 1)).toBe(layout)
  })

  it('fills an empty column, and walks a block across three columns one step at a time', () => {
    const once = moveNodeAcross(page(), E, 1)
    expect(ids(once, 'r2')).toEqual([[], [E], []])
    const twice = moveNodeAcross(once, E, 1)
    expect(ids(twice, 'r2')).toEqual([[], [], [E]])
    expect(moveNodeAcross(twice, E, 1)).toBe(twice)
    expect(ids(moveNodeAcross(twice, E, -1), 'r2')).toEqual([[], [E], []])
  })

  it('moves nothing in a section with one column', () => {
    const layout = page()
    expect(moveNodeAcross(layout, A, 1)).toBe(layout)
    expect(moveNodeAcross(layout, A, -1)).toBe(layout)
  })

  it('never leaves its section, and leaves every other section and the bench alone', () => {
    const before = page()
    const after = moveNodeAcross(before, C, 1)
    expect(after.rows[0]).toEqual(before.rows[0])
    expect(after.rows[2]).toEqual(before.rows[2])
    expect(after.bench).toEqual(before.bench)
  })

  it('moves a live data section that is at its cap, and the Space write guard keeps it', () => {
    // Events is function-backed and capped at one per page. The lock rule decides what may be ADDED; a
    // move adds nothing, so the one Events block crosses with its settings and is still the only one.
    expect(entityBlockLimit('events')).toBe(1)
    const after = moveNodeAcross(page(), D, -1)
    const moved = after.rows[1].cells[0][2]
    expect(moved).toEqual(node(D, 'events', { content: { title: 'Coming up' } }))
    const stored = sanitizeNodeLayout(after, 'space')!
    expect(stored.rows[1].cells.map((stack) => stack.map((n) => n.type))).toEqual([['text', 'callout', 'events'], []])
  })

  it('refuses a full column instead of pushing a block off the page', () => {
    const full = page()
    full.rows[1].cells[1] = Array.from({ length: 12 }, (_, i) => node(`nfull${String(i).padStart(6, '0')}`, 'text'))
    expect(columnMoveTarget(full.rows.map((r) => ({ id: r.id, cells: r.cells.map((s) => s.map((n) => n.nid)) })), B, 1)).toBeNull()
    expect(moveNodeAcross(full, B, 1)).toBe(full)
  })

  it('is a no-op for a benched or unknown block', () => {
    const layout = page()
    expect(moveNodeAcross(layout, 'nbench00001', 1)).toBe(layout)
    expect(moveNodeAcross(layout, 'nnope000000', 1)).toBe(layout)
  })
})

describe('columnMoveTarget', () => {
  it('answers on block keys alone, so the type-keyed store reads the same rule', () => {
    const rows = [{ id: 'r1', cells: [['text', 'callout'], ['events']] }]
    expect(columnMoveTarget(rows, 'text', 1)).toEqual({ rowId: 'r1', col: 1, index: 1 })
    expect(columnMoveTarget(rows, 'events', -1)).toEqual({ rowId: 'r1', col: 0, index: 2 })
    expect(columnMoveTarget(rows, 'text', -1)).toBeNull()
  })
})
