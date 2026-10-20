import { useEffect, useLayoutEffect, useMemo } from 'react'
import { emailPalette, type EntityBlockDef } from '@/lib/entity-blocks/registry'
import { addRow, moveRow, placeBlock, removeBlock, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { addNode, canPlaceType, getNode, removeNode, setNodeContent } from '@/lib/entity-blocks/node-ops'
import { addNodeRow, moveNodeRow, removeNodeRow } from '@/lib/entity-blocks/node-row-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { useNodeLayout } from '@/components/entity-blocks/node-layout-store'

// THE EMAIL CANVAS MODEL (E0 task 12b, ADR-1859). What the on-canvas email editor needs from whichever store
// drives it, in one shape: the single-column block list in reading order, each block with a KEY (its type on the
// live store, its node id on the node store), its TYPE and its content bag, plus the operations the editor
// performs. The editor view is written once against this; `useLegacyEmailModel` adapts the type-keyed store
// and `useNodeEmailModel` the node store (ADR-1835), as the Space canvas does (canvas-model.ts). A key is only
// compared and used as a React or Map key, never as a property name written through (CodeQL
// js/remote-property-injection).

export interface EmailBlock {
  key: string
  type: string
  content: Record<string, unknown>
}
export interface EmailCanvasModel {
  seeded: boolean
  saving: boolean
  blocks: EmailBlock[]
  /** Palette types that can still be added (not yet placed on the live store; under their cap on the node store). */
  addable: EntityBlockDef[]
  /** Move a block up (-1) or down (+1) one place. */
  reorder: (key: string, delta: -1 | 1) => void
  /** Move a block to the place another block holds (drag and drop). */
  reorderTo: (key: string, targetKey: string) => void
  /** Append a block of `type`; returns the key to select, or null when it could not be added. */
  add: (type: string) => string | null
  remove: (key: string) => void
  setField: (key: string, field: string, value: unknown) => void
}

export function useLegacyEmailModel(): EmailCanvasModel | null {
  const store = useProfileLayout()
  const blocks = useMemo<EmailBlock[]>(
    () =>
      (store?.rows ?? []).flatMap((r) => {
        const id = r.cells[0]?.[0]
        return id ? [{ key: id, type: id, content: store?.content[id] ?? {} }] : []
      }),
    [store?.rows, store?.content],
  )
  if (!store) return null
  const layout: BuilderLayout = { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
  const indexOf = (key: string) => store.rows.findIndex((r) => r.cells[0]?.[0] === key)
  const placed = new Set(blocks.map((b) => b.key))
  return {
    seeded: store.seeded,
    saving: store.saving,
    blocks,
    addable: emailPalette().filter((b) => !placed.has(b.id)),
    reorder: (key, delta) => {
      const from = indexOf(key)
      if (from >= 0) store.apply(moveRow(layout, from, from + delta))
    },
    reorderTo: (key, targetKey) => {
      const from = indexOf(key)
      const to = indexOf(targetKey)
      if (from >= 0 && to >= 0) store.apply(moveRow(layout, from, to))
    },
    add: (type) => {
      const withRow = addRow(layout)
      const row = withRow.rows[withRow.rows.length - 1]
      if (!row) return null
      store.apply(placeBlock(withRow, type, row.id, 0))
      return type
    },
    remove: (key) => store.apply(removeBlock(layout, key)),
    // patchContent folds over the freshest bag, so several fields landing in one tick all stay.
    setField: (key, field, value) => store.patchContent(key, { [field]: value }),
  }
}

/** Drop rows that hold no node, so a removed block never leaves a gap in the email. */
function pruneEmptyRows(layout: NodeLayout): NodeLayout {
  return layout.rows
    .filter((r) => r.cells.every((stack) => stack.length === 0))
    .reduce((acc, r) => removeNodeRow(acc, r.id), layout)
}

export function useNodeEmailModel(): EmailCanvasModel | null {
  const store = useNodeLayout()
  const layout = store?.layout ?? null
  const blocks = useMemo<EmailBlock[]>(
    () =>
      (layout?.rows ?? []).flatMap((r) => {
        const n = r.cells[0]?.[0]
        return n && n.hidden !== true ? [{ key: n.nid, type: n.type, content: n.content ?? {} }] : []
      }),
    [layout],
  )
  if (!store) return null
  const edit = store.edit
  const rowIndex = (l: NodeLayout, nid: string) => l.rows.findIndex((r) => r.cells.some((stack) => stack.some((n) => n.nid === nid)))
  return {
    seeded: store.seeded && !!layout,
    saving: store.saving,
    blocks,
    addable: layout ? emailPalette().filter((b) => canPlaceType(layout, b.id)) : [],
    reorder: (key, delta) =>
      edit((l) => {
        const from = rowIndex(l, key)
        return from < 0 ? l : moveNodeRow(l, from, from + delta)
      }),
    reorderTo: (key, targetKey) =>
      edit((l) => {
        const from = rowIndex(l, key)
        const to = rowIndex(l, targetKey)
        return from < 0 || to < 0 ? l : moveNodeRow(l, from, to)
      }),
    add: (type) => {
      // `edit` runs the change synchronously over the freshest layout, so the new id is known here.
      let nid: string | null = null
      edit((l) => {
        const withRow = addNodeRow(l)
        if (withRow.rows.length === l.rows.length) return l
        const out = addNode(withRow, type, withRow.rows[withRow.rows.length - 1].id, 0)
        nid = out.nid
        return out.nid ? out.layout : l
      })
      return nid
    },
    remove: (key) => edit((l) => pruneEmptyRows(removeNode(l, key))),
    setField: (key, field, value) =>
      edit((l) => {
        const bag = { ...(getNode(l, key)?.content ?? {}) }
        const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
        if (empty) delete bag[field]
        else bag[field] = value
        return setNodeContent(l, key, Object.keys(bag).length ? bag : undefined)
      }),
  }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Seeds the node store from a node document the instant the editor mounts. First seed wins. */
export function NodeSeeder({ layout }: { layout: NodeLayout }) {
  const store = useNodeLayout()
  useIsoLayoutEffect(() => {
    store?.seed(layout)
  }, [store, layout])
  return null
}
