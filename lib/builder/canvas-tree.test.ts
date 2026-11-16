import { describe, expect, it } from 'vitest'
import { canvasTree, dragSpacing, moveInTree, SPACING_SCALE, spacingStepOf, spacingWord, stepSlot, stepSpacing, treeLayers, undoChange, undoWords, UNDO_ADD, withSpacing, type LayerTree } from './canvas-tree'
import { sanitizeBlockStyle } from '@/lib/entity-blocks/block-content'
import { placeNode } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'

// PROG-E6B. The canvas's structure model: the layer tree and its moves, and spacing as named steps.

const A = 'ntext0000001'
const B = 'ntext0000002'
const C = 'ncallout0001'
const D = 'nquote000001'
const layout = (): NodeLayout => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: A, type: 'text' }, { nid: B, type: 'text' }]] },
    { id: 'r2', columns: 2, title: 'Side by side', cells: [[{ nid: C, type: 'callout' }], []] },
    { id: 'r3', columns: 1, cells: [[{ nid: D, type: 'quote' }]] },
  ],
  bench: [],
})
const LAYERS = [{ id: A, label: 'Text' }, { id: B, label: 'Text 2' }, { id: C, label: 'Callout' }, { id: D, label: 'Quote' }]
const tree = (): LayerTree => canvasTree(layout(), LAYERS)
const ids = (t: LayerTree) => t.map((row) => row.columns.map((stack) => stack.map((layer) => layer.id)))

describe('the layer tree', () => {
  it('nests the page as rows, columns and blocks, naming a row by its title or its place', () => {
    const t = tree()
    expect(t.map((row) => row.label)).toEqual(['Row 1', 'Side by side', 'Row 3'])
    expect(ids(t)).toEqual([[[A, B]], [[C], []], [[D]]])
    expect(t[0]!.columns[0]![1]).toEqual({ id: B, label: 'Text 2' })
    expect(treeLayers(t).map((layer) => layer.id)).toEqual([A, B, C, D])
  })

  it('moves a block to a slot, and changes nothing for a block or a slot that is not there', () => {
    const t = tree()
    expect(ids(moveInTree(t, A, { rowId: 'r2', col: 1, index: 0 }))).toEqual([[[B]], [[C], [A]], [[D]]])
    expect(ids(moveInTree(t, A, { rowId: 'r1', col: 0, index: 1 }))).toEqual([[[B, A]], [[C], []], [[D]]])
    expect(ids(moveInTree(t, D, { rowId: 'r1', col: 0, index: 99 }))).toEqual([[[A, B, D]], [[C], []], [[]]])
    expect(moveInTree(t, 'nmissing0001', { rowId: 'r1', col: 0, index: 0 })).toBe(t)
    expect(moveInTree(t, A, { rowId: 'r9', col: 0, index: 0 })).toBe(t)
    expect(moveInTree(t, A, { rowId: 'r2', col: 2, index: 0 })).toBe(t)
  })

  it('means the same slot the document does: a tree move and a stored move agree', () => {
    for (const [id, to] of [[A, { rowId: 'r2', col: 1, index: 0 }], [B, { rowId: 'r1', col: 0, index: 0 }], [C, { rowId: 'r3', col: 0, index: 1 }], [D, { rowId: 'r2', col: 0, index: 0 }]] as const) {
      const stored = placeNode(layout(), id, to.rowId, to.col, to.index)
      expect(ids(moveInTree(tree(), id, to))).toEqual(stored.rows.map((row) => row.cells.map((stack) => stack.map((node) => node.nid))))
    }
  })

  it('steps a block through every place on the page with no drag: along its column, then into the next one', () => {
    const t = tree()
    expect(stepSlot(t, A, 1)).toEqual({ rowId: 'r1', col: 0, index: 1 })
    expect(stepSlot(t, B, 1)).toEqual({ rowId: 'r2', col: 0, index: 0 })
    // An empty column is a place too.
    expect(stepSlot(t, C, 1)).toEqual({ rowId: 'r2', col: 1, index: 0 })
    expect(stepSlot(t, D, -1)).toEqual({ rowId: 'r2', col: 1, index: 0 })
    expect(stepSlot(t, C, -1)).toEqual({ rowId: 'r1', col: 0, index: 2 })
    expect(stepSlot(t, A, -1)).toBeNull()
    expect(stepSlot(t, D, 1)).toBeNull()
    // Walking down from the top reaches the bottom, never losing a block.
    let walked = t
    for (let i = 0; i < 12; i++) {
      const to = stepSlot(walked, A, 1)
      if (!to) break
      walked = moveInTree(walked, A, to)
    }
    expect(treeLayers(walked).map((layer) => layer.id)).toEqual([B, C, D, A])
  })
})

describe('spacing is a named step, never a length', () => {
  it('reads the stored step, and treats a missing or foreign value as the default', () => {
    expect(spacingStepOf({ mt: 'lg', pad: 'sm' }, 'mt')).toBe('lg')
    expect(spacingStepOf({ mt: 'lg', pad: 'sm' }, 'pad')).toBe('sm')
    expect(spacingStepOf(undefined, 'mb')).toBe('default')
    expect(spacingStepOf({ pad: '24px' } as never, 'pad')).toBe('default')
  })

  it('walks the scale one step at a time and stops at the ends', () => {
    expect(stepSpacing('mt', 'default', 1)).toBe('sm')
    expect(stepSpacing('mt', 'default', -1)).toBe('none')
    expect(stepSpacing('mt', 'none', -1)).toBe('none')
    expect(stepSpacing('mb', 'xl', 3)).toBe('xl')
    expect(stepSpacing('pad', 'default', -1)).toBe('default')
    expect(stepSpacing('pad', 'md', 5)).toBe('lg')
  })

  it('turns a drag into whole steps: down is more, up is less, a small wobble is nothing', () => {
    expect(dragSpacing('mt', 'default', 5)).toBe('default')
    expect(dragSpacing('mt', 'default', 16)).toBe('sm')
    expect(dragSpacing('mt', 'default', 40)).toBe('lg')
    expect(dragSpacing('mt', 'md', -33)).toBe('default')
    expect(dragSpacing('pad', 'sm', 9000)).toBe('lg')
    for (const edge of ['mt', 'pad', 'mb'] as const) for (const delta of [-500, -17, 0, 3.7, 88, 1e6]) expect(SPACING_SCALE[edge]).toContain(dragSpacing(edge, 'default', delta))
  })

  it('writes only what the document sanitizer keeps, and leaves no key behind for the default', () => {
    expect(withSpacing({ align: 'center' }, 'mt', 'lg')).toEqual({ align: 'center', mt: 'lg' })
    expect(withSpacing({ mt: 'lg' }, 'mt', 'default')).toBeUndefined()
    expect(withSpacing({ mt: 'lg', pad: 'md' }, 'pad', 'default')).toEqual({ mt: 'lg' })
    // A step that is not on that edge's scale changes nothing: padding has no `xl` and no `none`.
    expect(withSpacing({ pad: 'sm' }, 'pad', 'xl')).toEqual({ pad: 'sm' })
    expect(withSpacing(undefined, 'mb', '3rem' as never)).toBeUndefined()
    for (const edge of ['mt', 'pad', 'mb'] as const) {
      for (const step of SPACING_SCALE[edge]) {
        const style = withSpacing(undefined, edge, step)
        expect(sanitizeBlockStyle(style)).toEqual(style)
      }
    }
  })

  it('says each step in words', () => {
    expect(spacingWord('mt', 'none')).toBe('Flush')
    expect(spacingWord('mt', 'default')).toBe('Default')
    expect(spacingWord('pad', 'default')).toBe('None')
    expect(spacingWord('mb', 'xl')).toBe('Extra large')
  })
})

// PROG-E6C: each change to the page's shape has an opposite, worked out from the page before it is sent.
describe('undoChange', () => {
  const tree: LayerTree = [{ id: 'r1', label: 'Row 1', columns: [[{ id: 'a', label: 'A' }, { id: 'b', label: 'B', hidden: true }]] }]
  it.each([
    [{ kind: 'move', to: { rowId: 'r1', col: 0, index: 0 } }, 'b', { kind: 'move', to: { rowId: 'r1', col: 0, index: 1 } }],
    [{ kind: 'spacing', edge: 'mb', step: 'xl' }, 'a', { kind: 'spacing', edge: 'mb', step: 'sm' }],
    [{ kind: 'hide', hidden: false }, 'b', { kind: 'hide', hidden: true }],
    [{ kind: 'remove', keep: true }, 'a', { kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }],
    [{ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }, 'z', { kind: 'remove', keep: true }],
    [{ kind: 'remove', keep: false }, 'a', null],
    [{ kind: 'duplicate' }, 'a', null],
    [{ kind: 'insert', source: 'preset', id: 'welcome' }, 'a', null],
  ] as const)('undoes %j', (change, nid, back) => {
    expect(undoChange(tree, nid, change, { style: { mb: 'sm' }, hidden: nid === 'b' })).toEqual(back)
  })
  it('names what Undo takes back', () => {
    expect(['move', 'spacing'].map((kind) => undoWords({ kind } as never))).toEqual(['Undo move', 'Undo spacing'])
    expect(undoWords(UNDO_ADD)).toBe('Undo add')
    expect(undoWords({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } })).toBe('Undo remove')
  })
})
