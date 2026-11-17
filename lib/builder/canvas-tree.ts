// THE CANVAS'S STRUCTURE, CLIENT SAFE (PROG-E6B). PURE: no React, no DOM, and no block registry, so the canvas
// chunk can import it. Three things the canvas does to a real document besides editing a block's fields:
//
//   • the LAYER TREE: a Space page is rows, each row is columns, each column is a stack of blocks. The tree is that
//     nesting with names, and a move is "this block, to that row, column and place";
//   • SPACING: a block's space above, space below and inner padding. Each is a named step the document already
//     stores (`style.mt`, `style.mb`, `style.pad`), never a pixel value. A handle walks the steps;
//   • the CHANGE a tab sends to the one draft write (app/(main)/pages/canvas/document-actions.ts);
//   • UNDO (PROG-E6C): every change to the page's shape has an opposite change, worked out here before it is sent,
//     so undoing is one more change through the same write, never a stored copy of the page.
//
// The server applies the same change to the stored document (applyCanvasChange, canvas-document.ts). What is here
// lets the tab show the result at once and lets the server and the tab agree on what a step or a slot means.

import type { BlockNode, NodeLayout } from '@/lib/entity-blocks/node-tree'

/** A block in the tree. `hidden` is set when the page skips it (PROG-E6C). */
type TreeLayer = { id: string; label: string; hidden?: true }

/** How a row splits its width (PROG-E6D): one column, or two (even, wide left or wide right). A Space page holds at
 *  most two columns (lib/entity-blocks/layout.ts MAX_COLUMNS_BY_KIND), so the canvas offers no wider split. */
export type RowSplit = 'full' | 'even' | 'lead' | 'sidebar'
export const ROW_SPLITS: readonly RowSplit[] = ['full', 'even', 'lead', 'sidebar']
export const ROW_SPLIT_WORDS: Record<RowSplit, string> = { full: 'One column', even: 'Two even', lead: 'Wide left', sidebar: 'Wide right' }
/** How many columns a split has. */
export const splitColumns = (split: RowSplit): number => (split === 'full' ? 1 : 2)

/** One row of the page: its columns, each a stack of blocks in order, and how it splits its width. */
interface LayerTreeRow {
  id: string
  label: string
  columns: TreeLayer[][]
  split?: RowSplit
}
export type LayerTree = LayerTreeRow[]

/** A place in the tree. `index` counts the column's blocks with the moving block already lifted out. */
export interface LayerSlot {
  rowId: string
  col: number
  index: number
}

export type SpacingEdge = 'mt' | 'pad' | 'mb'
export type SpacingStep = 'none' | 'default' | 'sm' | 'md' | 'lg' | 'xl'

/** What a tab may ask of the draft besides a field edit. An insert names a preset or a blank block by id; the
 *  server decides what that id holds. PROG-E6C adds four: a copy of the block under it, hiding or showing it,
 *  removing it, and putting a removed block back. A removal `keep`s the block on the page's bench (the Space page
 *  builder's tray, words and all) unless it is the undo of an add, which takes the new block away for good. */
export type CanvasChange =
  | { kind: 'move'; to: LayerSlot }
  | { kind: 'spacing'; edge: SpacingEdge; step: SpacingStep }
  | { kind: 'insert'; source: 'preset' | 'blank'; id: string }
  | { kind: 'duplicate' }
  | { kind: 'hide'; hidden: boolean }
  | { kind: 'remove'; keep: boolean }
  | { kind: 'restore'; to: LayerSlot }
  // PROG-E6D: the rows themselves. A new row is empty and lands at an index; only an empty row can be removed,
  // and a split can only drop columns that are empty, so no block is ever folded, benched or lost by a row change.
  | { kind: 'row-add'; at: number }
  | { kind: 'row-remove'; rowId: string }
  | { kind: 'row-move'; rowId: string; by: -1 | 1 }
  | { kind: 'row-split'; rowId: string; split: RowSplit }
/** One of the row changes alone. */
export type RowChange = Extract<CanvasChange, { kind: `row-${string}` }>

/** The steps a handle walks, smallest first. `default` is "not set": the page's own rhythm for a margin, no
 *  padding for the inside. A margin can also be `none`, which pulls the block flush against its neighbour. */
export const SPACING_SCALE: Record<SpacingEdge, readonly SpacingStep[]> = {
  mt: ['none', 'default', 'sm', 'md', 'lg', 'xl'],
  pad: ['default', 'sm', 'md', 'lg'],
  mb: ['none', 'default', 'sm', 'md', 'lg', 'xl'],
}

export const SPACING_EDGE_WORDS: Record<SpacingEdge, string> = { mt: 'Space above', pad: 'Padding', mb: 'Space below' }
const STEP_WORDS: Record<SpacingStep, string> = { none: 'Flush', default: 'Default', sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large' }

/** A step in words. Padding that is not set is no padding, so it says so. */
export function spacingWord(edge: SpacingEdge, step: SpacingStep): string {
  return edge === 'pad' && step === 'default' ? 'None' : STEP_WORDS[step]
}

/** The step a block's stored style holds on one edge. */
export function spacingStepOf(style: BlockNode['style'], edge: SpacingEdge): SpacingStep {
  const stored = style?.[edge]
  return stored && SPACING_SCALE[edge].includes(stored) ? stored : 'default'
}

/** `by` steps along the edge's scale from `from`, held at the ends. */
export function stepSpacing(edge: SpacingEdge, from: SpacingStep, by: number): SpacingStep {
  const scale = SPACING_SCALE[edge]
  const at = Math.max(0, scale.indexOf(from))
  return scale[Math.max(0, Math.min(scale.length - 1, at + Math.trunc(by)))]!
}

/** How far a handle travels per step. A drag is counted in steps: the distance never reaches the document. */
const DRAG_PER_STEP = 16

/** The step a drag lands on: down (or right) is more space, up is less. */
export function dragSpacing(edge: SpacingEdge, from: SpacingStep, delta: number): SpacingStep {
  return stepSpacing(edge, from, Math.round(delta / DRAG_PER_STEP))
}

/** A style bag with one edge set to a step. `default` removes the key, so the stored bag stays sparse. Returns
 *  undefined when nothing is left. A step that is not on the edge's scale changes nothing. */
export function withSpacing(style: BlockNode['style'], edge: SpacingEdge, step: SpacingStep): BlockNode['style'] {
  if (!SPACING_SCALE[edge].includes(step)) return style
  const rest = Object.fromEntries(Object.entries(style ?? {}).filter(([key]) => key !== edge))
  const next = step === 'default' ? rest : { ...rest, [edge]: step }
  return Object.keys(next).length ? (next as BlockNode['style']) : undefined
}

/** The page as a tree. `layers` gives each placed block its name (canvasLayers numbers a repeated type). A row
 *  is named by its title when it has one, else by its place. */
export function canvasTree(layout: NodeLayout, layers: readonly TreeLayer[]): LayerTree {
  const names = new Map(layers.map((layer) => [layer.id, layer.label]))
  return layout.rows.map((row, i) => ({
    id: row.id,
    label: row.title?.trim() || `Row ${i + 1}`,
    split: rowSplitOf(row.columns, row.ratio),
    columns: row.cells.map((stack) => stack.map((node) => ({ id: node.nid, label: names.get(node.nid) ?? 'Block', ...(node.hidden ? { hidden: true as const } : {}) }))),
  }))
}

/** A stored row's split, read from its column count and ratio. */
export function rowSplitOf(columns: number, ratio?: string): RowSplit {
  if (columns < 2) return 'full'
  return ratio === 'lead' ? 'lead' : ratio === 'trail' ? 'sidebar' : 'even'
}

/** Whether a row can take a split: every column it would drop must already be empty. */
export function canSplit(row: Pick<LayerTreeRow, 'columns'>, split: RowSplit): boolean {
  return row.columns.slice(splitColumns(split)).every((stack) => stack.length === 0)
}

/** Every block in reading order: row, then column, then place in the stack. */
export function treeLayers(tree: LayerTree): TreeLayer[] {
  return tree.flatMap((row) => row.columns.flat())
}

/** Where a block sits now, or null when it is not on the page. */
export function slotOf(tree: LayerTree, id: string): LayerSlot | null {
  for (const row of tree) {
    for (let col = 0; col < row.columns.length; col++) {
      const index = row.columns[col]!.findIndex((layer) => layer.id === id)
      if (index !== -1) return { rowId: row.id, col, index }
    }
  }
  return null
}

/** The tree with one block moved to a slot. Unchanged (the same object) when the block or the slot is not there. */
export function moveInTree(tree: LayerTree, id: string, to: LayerSlot): LayerTree {
  const from = slotOf(tree, id)
  const target = tree.find((row) => row.id === to.rowId)
  if (!from || !target || to.col < 0 || to.col >= target.columns.length) return tree
  const moving = tree.find((row) => row.id === from.rowId)!.columns[from.col]![from.index]!
  return tree.map((row) => {
    if (row.id !== from.rowId && row.id !== to.rowId) return row
    const columns = row.columns.map((stack, col) => {
      const lifted = row.id === from.rowId && col === from.col ? stack.filter((layer) => layer.id !== id) : stack
      if (row.id !== to.rowId || col !== to.col) return lifted
      const next = [...lifted]
      next.splice(Math.max(0, Math.min(to.index, next.length)), 0, moving)
      return next
    })
    return { ...row, columns }
  })
}

/** Where one step up (-1) or down (+1) in reading order puts a block: one place along its own column, or, at the
 *  column's end, the end of the column before or the start of the column after (an empty column counts, so a
 *  block can be carried into one). Null at the top and bottom of the page. */
export function stepSlot(tree: LayerTree, id: string, by: -1 | 1): LayerSlot | null {
  const from = slotOf(tree, id)
  if (!from) return null
  const columns = tree.flatMap((row) => row.columns.map((stack, col) => ({ rowId: row.id, col, size: stack.length })))
  const here = columns.findIndex((column) => column.rowId === from.rowId && column.col === from.col)
  const to = from.index + by
  if (to >= 0 && to < columns[here]!.size) return { rowId: from.rowId, col: from.col, index: to }
  const next = columns[here + by]
  return next ? { rowId: next.rowId, col: next.col, index: by < 0 ? next.size : 0 } : null
}

/** The change that puts back what `change` does to block `nid`, worked out from the page BEFORE it is sent (PROG-E6C;
 *  rows, PROG-E6D). A row move goes back the other way, a split goes back to the row's split before, and removing an
 *  (empty) row is undone by adding an empty row at its index. Adding a row is undone once the server names it.
 *  `style` is the block's stored style and `hidden` whether it is hidden now. Null for an add (a copy or an insert):
 *  its undo names the new block, which only the server's answer holds, and for a final removal, which cannot be
 *  put back. */
export function undoChange(tree: LayerTree, nid: string, change: CanvasChange, now: { style?: BlockNode['style']; hidden?: boolean }): CanvasChange | null {
  if (change.kind === 'spacing') return { kind: 'spacing', edge: change.edge, step: spacingStepOf(now.style, change.edge) }
  if (change.kind === 'hide') return { kind: 'hide', hidden: !!now.hidden }
  if (change.kind === 'restore') return { kind: 'remove', keep: true }
  if (change.kind === 'row-move') return { kind: 'row-move', rowId: change.rowId, by: change.by === 1 ? -1 : 1 }
  if (change.kind === 'row-split') {
    const row = tree.find((candidate) => candidate.id === change.rowId)
    return row?.split ? { kind: 'row-split', rowId: change.rowId, split: row.split } : null
  }
  if (change.kind === 'row-remove') {
    const at = tree.findIndex((candidate) => candidate.id === change.rowId)
    return at === -1 ? null : { kind: 'row-add', at }
  }
  if (change.kind === 'move' || (change.kind === 'remove' && change.keep)) {
    const at = slotOf(tree, nid)
    return at ? (change.kind === 'move' ? { kind: 'move', to: at } : { kind: 'restore', to: at }) : null
  }
  return null
}

/** The undo of an add, once the server has named the new block: take it away again. */
export const UNDO_ADD: CanvasChange = { kind: 'remove', keep: false }

/** What an undo button says it will do, in a few words. */
export function undoWords(change: CanvasChange): string {
  switch (change.kind) {
    case 'move': return 'Undo move'
    case 'spacing': return 'Undo spacing'
    case 'hide': return change.hidden ? 'Undo show' : 'Undo hide'
    case 'restore': return 'Undo remove'
    case 'remove': return change.keep ? 'Undo put back' : 'Undo add'
    case 'row-add': return 'Undo remove row'
    case 'row-remove': return 'Undo add row'
    case 'row-move': return 'Undo row move'
    case 'row-split': return 'Undo columns'
    default: return 'Undo'
  }
}
