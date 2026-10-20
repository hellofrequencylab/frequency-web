import { useMemo } from 'react'
import { profilePaletteForKind, type EntityBlockDef } from '@/lib/entity-blocks/registry'
import {
  addRow,
  moveRow,
  nudgeBox,
  placeBlock,
  placedIds,
  removeBlock,
  removeRow,
  setRowHeaderOn,
  setRowSplit,
  setRowTitle,
  type BuilderLayout,
  type RowSplit,
} from '@/lib/entity-blocks/rows-ops'
import { addNode, canPlaceType, nudgeNode, removeNode } from '@/lib/entity-blocks/node-ops'
import {
  addNodeRow,
  moveNodeRow,
  removeNodeRow,
  setNodeRowHeaderOn,
  setNodeRowSplit,
  setNodeRowTitle,
} from '@/lib/entity-blocks/node-row-ops'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { setNodeContent } from '@/lib/entity-blocks/node-ops'

// THE CANVAS MODEL (E0 task 12b, ADR-1852). What the on-canvas Space editor needs from whichever store drives
// it, in one shape: sections of blocks, each block with a KEY (its type on the live store, its node id on the
// node store), its TYPE (what it is) and its content bag, plus the operations the editor performs. The
// editor view is written once against this; `useLegacyCanvasModel` adapts the type-keyed store and
// `useNodeCanvasModel` the node store (ADR-1835), so the node path is a second adapter, not a second copy of
// a 550-line editor. A key is only ever compared and used as a React key or a Map key, never as a property
// name to write through (CodeQL js/remote-property-injection).

export interface CanvasBlock {
  key: string
  type: string
  content: Record<string, unknown>
  /** The node id, on the node store only; the canvas block selects by it. */
  nid?: string
}
export interface CanvasRow {
  id: string
  columns: number
  ratio?: string
  title?: string
  cells: CanvasBlock[][]
}
export interface CanvasModel {
  seeded: boolean
  saving: boolean
  rows: CanvasRow[]
  /** The palette types that can still be added (not placed on the live store; under their cap on the node store). */
  addable: EntityBlockDef[]
  addSection: () => void
  removeSection: (rowId: string) => void
  moveSection: (from: number, to: number) => void
  split: (rowId: string, split: RowSplit) => void
  sectionTitle: (rowId: string, value: string) => void
  /** Place a block of `type`; returns the key of the block to select. */
  place: (type: string, rowId: string, col: number) => string | null
  remove: (key: string) => void
  nudge: (key: string, delta: -1 | 1) => void
  setField: (key: string, field: string, value: unknown) => void
}

export function useLegacyCanvasModel(): CanvasModel | null {
  const store = useProfileLayout()
  const placed = useMemo(() => placedIds(store?.rows ?? []), [store?.rows])
  if (!store) return null
  const layout: BuilderLayout = { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
  const mutate = (next: BuilderLayout) => store.apply(next)
  return {
    seeded: store.seeded,
    saving: store.saving,
    rows: store.rows.map((row) => ({
      id: row.id,
      columns: row.columns,
      ratio: row.ratio,
      title: row.title,
      cells: row.cells.map((stack) => stack.map((id) => ({ key: id, type: id, content: store.content[id] ?? {} }))),
    })),
    addable: profilePaletteForKind('space').filter((b) => !placed.has(b.id)),
    addSection: () => mutate(addRow(layout)),
    removeSection: (rowId) => mutate(removeRow(layout, rowId)),
    moveSection: (from, to) => {
      if (to < 0 || to >= layout.rows.length) return
      mutate(moveRow(layout, from, to))
    },
    split: (rowId, s) => mutate(setRowSplit(layout, rowId, s)),
    // The section title is WYSIWYG: a non-blank title also turns its live header on; clearing drops both.
    sectionTitle: (rowId, value) => mutate(setRowHeaderOn(setRowTitle(layout, rowId, value), rowId, value.trim().length > 0)),
    place: (type, rowId, col) => {
      mutate(placeBlock(layout, type, rowId, col))
      return type
    },
    remove: (key) => mutate(removeBlock(layout, key)),
    nudge: (key, delta) => mutate(nudgeBox(layout, key, delta)),
    // patchContent folds over the freshest bag, so two writes in one tick both land.
    setField: (key, field, value) => store.patchContent(key, { [field]: value }),
  }
}

export function useNodeCanvasModel(): CanvasModel | null {
  const store = useNodeLayout()
  if (!store) return null
  const layout = store.layout
  const edit = store.edit
  const palette = profilePaletteForKind('space')
  return {
    seeded: store.seeded && !!layout,
    saving: store.saving,
    rows: (layout?.rows ?? []).map((row) => ({
      id: row.id,
      columns: row.columns,
      ratio: row.ratio,
      title: row.title,
      cells: row.cells.map((stack) => stack.map((n) => ({ key: n.nid, type: n.type, content: n.content ?? {}, nid: n.nid }))),
    })),
    addable: layout ? palette.filter((b) => canPlaceType(layout, b.id)) : [],
    addSection: () => edit((l) => addNodeRow(l)),
    removeSection: (rowId) => edit((l) => removeNodeRow(l, rowId)),
    moveSection: (from, to) => {
      if (to < 0 || to >= (layout?.rows.length ?? 0)) return
      edit((l) => moveNodeRow(l, from, to))
    },
    split: (rowId, s) => edit((l) => setNodeRowSplit(l, rowId, s)),
    sectionTitle: (rowId, value) =>
      edit((l) => setNodeRowHeaderOn(setNodeRowTitle(l, rowId, value), rowId, value.trim().length > 0)),
    place: (type, rowId, col) => {
      // `edit` runs the change synchronously over the freshest layout, so the new id is known here.
      let nid: string | null = null
      edit((l) => {
        const out = addNode(l, type, rowId, col)
        nid = out.nid
        return out.layout
      })
      return nid
    },
    remove: (key) => edit((l) => removeNode(l, key)),
    nudge: (key, delta) => edit((l) => nudgeNode(l, key, delta)),
    setField: (key, field, value) =>
      edit((l) => {
        const bag = { ...(findBag(l, key) ?? {}) }
        const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
        if (empty) delete bag[field]
        else bag[field] = value
        return setNodeContent(l, key, Object.keys(bag).length ? bag : undefined)
      }),
  }
}

function findBag(layout: { rows: { cells: { nid: string; content?: Record<string, unknown> }[][] }[]; bench: { nid: string; content?: Record<string, unknown> }[] }, nid: string) {
  for (const row of layout.rows) for (const stack of row.cells) for (const n of stack) if (n.nid === nid) return n.content
  return layout.bench.find((n) => n.nid === nid)?.content
}
