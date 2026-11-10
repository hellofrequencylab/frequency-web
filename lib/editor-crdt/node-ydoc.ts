// THE CRDT DOCUMENT — E0 task 18, first increment (docs/EDITOR-E0.md §7).
//
// A `NodeLayout` (lib/entity-blocks/node-tree.ts) mapped onto a Yjs document and back, plus the
// per-client undo manager. Pure: no Realtime client, no React, no network. EDITOR ONLY. Nothing a
// visitor's bundle imports may reach this file (ratchet: docs/EDITOR-ARCHITECTURE.md §7.3).
//
// Shape of the Y.Doc (root map "layout"):
//   rows   Y.Array<Y.Map>   one map per row: scalar fields + `cells` Y.Array<Y.Array<Y.Map>>
//   bench  Y.Array<Y.Map>   authored-but-unplaced nodes
//   meta   Y.Map            `template`
// A node is a Y.Map: `nid`, `type`, `hidden`, `content` (Y.Map, one entry per top-level key) and
// `style` (Y.Map). Values under a key are JSON, replaced whole: two people editing DIFFERENT fields
// of one block merge; two people editing the SAME field resolve last-writer-wins. Rich text moves
// to Y.Text when E4 puts Tiptap on y-prosemirror.
//
// `page_versions` stores serialized trees, never Yjs state, so a restored version needs no CRDT
// runtime. That is why `serializeLayout` exists.

import * as Y from 'yjs'
import type { BlockNode, NodeLayout } from '../entity-blocks/node-tree'

const ROOT = 'layout'
/** Origin tag for transactions applied from a remote peer, so the undo manager ignores them. */
export const REMOTE_ORIGIN = 'remote'
/** Origin tag for a local edit. Only this origin is undoable. */
const LOCAL_ORIGIN = 'local'

type Json = unknown

function setScalars(m: Y.Map<unknown>, src: Record<string, unknown>, skip: ReadonlySet<string>) {
  for (const [k, v] of Object.entries(src)) {
    if (skip.has(k) || v === undefined) continue
    m.set(k, v)
  }
}

function bagToMap(bag: Record<string, unknown> | undefined): Y.Map<Json> | null {
  if (!bag) return null
  const m = new Y.Map<Json>()
  for (const [k, v] of Object.entries(bag)) if (v !== undefined) m.set(k, v)
  return m
}

function nodeToMap(n: BlockNode): Y.Map<unknown> {
  const m = new Y.Map<unknown>()
  m.set('nid', n.nid)
  m.set('type', n.type)
  if (n.hidden !== undefined) m.set('hidden', n.hidden)
  const content = bagToMap(n.content)
  if (content) m.set('content', content)
  const style = bagToMap(n.style as Record<string, unknown> | undefined)
  if (style) m.set('style', style)
  return m
}

function mapToBag(m: unknown): Record<string, unknown> | undefined {
  if (!(m instanceof Y.Map)) return undefined
  return Object.fromEntries(m.entries())
}

function mapToNode(m: Y.Map<unknown>): BlockNode {
  const node: BlockNode = { nid: m.get('nid') as string, type: m.get('type') as string }
  const content = mapToBag(m.get('content'))
  if (content) node.content = content
  const style = mapToBag(m.get('style'))
  if (style) node.style = style as BlockNode['style']
  const hidden = m.get('hidden')
  if (hidden !== undefined) node.hidden = hidden as boolean
  return node
}

/** Write `layout` into `doc` (replacing whatever the root held). One transaction, local origin. */
function writeLayout(doc: Y.Doc, layout: NodeLayout): void {
  doc.transact(() => {
    const root = doc.getMap(ROOT)
    const rows = new Y.Array<Y.Map<unknown>>()
    for (const r of layout.rows) {
      const rm = new Y.Map<unknown>()
      setScalars(rm, r as unknown as Record<string, unknown>, new Set(['cells']))
      const cols = new Y.Array<Y.Array<Y.Map<unknown>>>()
      for (const col of r.cells) {
        const ca = new Y.Array<Y.Map<unknown>>()
        ca.push(col.map(nodeToMap))
        cols.push([ca])
      }
      rm.set('cells', cols)
      rows.push([rm])
    }
    const bench = new Y.Array<Y.Map<unknown>>()
    bench.push(layout.bench.map(nodeToMap))
    const meta = new Y.Map<unknown>()
    if (layout.template !== undefined) meta.set('template', layout.template)
    root.set('rows', rows)
    root.set('bench', bench)
    root.set('meta', meta)
  }, LOCAL_ORIGIN)
}

// ── RECONCILE: bring an existing doc to a target tree with the SMALLEST change ─────────────────────
// The page builder's store works on plain trees (node-ops). To share edits, the store's next tree is
// written onto the doc here: rows and bench nodes are matched by id, a field that did not change is
// not touched (so a peer's concurrent edit to it survives), and only a moved or re-shaped part is
// rebuilt. Rebuilding drops a concurrent edit INSIDE that part: the accepted cost of a move.

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function patchBag(owner: Y.Map<unknown>, key: string, bag: Record<string, unknown> | undefined) {
  const cur = owner.get(key)
  if (!bag) {
    if (cur !== undefined) owner.delete(key)
    return
  }
  if (!(cur instanceof Y.Map)) {
    owner.set(key, bagToMap(bag))
    return
  }
  for (const k of [...cur.keys()]) if (!(k in bag) || bag[k] === undefined) cur.delete(k)
  for (const [k, v] of Object.entries(bag)) if (v !== undefined && !sameJson(cur.get(k), v)) cur.set(k, v)
}

function patchNode(m: Y.Map<unknown>, n: BlockNode) {
  if (m.get('type') !== n.type) m.set('type', n.type)
  if (n.hidden === undefined) {
    if (m.get('hidden') !== undefined) m.delete('hidden')
  } else if (m.get('hidden') !== n.hidden) m.set('hidden', n.hidden)
  patchBag(m, 'content', n.content)
  patchBag(m, 'style', n.style as Record<string, unknown> | undefined)
}

function cellShape(cells: BlockNode[][]): string {
  return JSON.stringify(cells.map((c) => c.map((n) => n.nid)))
}

function yCellShape(colsY: unknown): string | null {
  if (!(colsY instanceof Y.Array)) return null
  return JSON.stringify(
    (colsY.toArray() as unknown[]).map((c) =>
      c instanceof Y.Array ? (c.toArray() as Y.Map<unknown>[]).map((n) => (n instanceof Y.Map ? n.get('nid') : null)) : null,
    ),
  )
}

function buildCells(cells: BlockNode[][]): Y.Array<Y.Array<Y.Map<unknown>>> {
  const cols = new Y.Array<Y.Array<Y.Map<unknown>>>()
  for (const col of cells) {
    const ca = new Y.Array<Y.Map<unknown>>()
    ca.push(col.map(nodeToMap))
    cols.push([ca])
  }
  return cols
}

function buildRow(r: NodeLayout['rows'][number]): Y.Map<unknown> {
  const rm = new Y.Map<unknown>()
  setScalars(rm, r as unknown as Record<string, unknown>, new Set(['cells']))
  rm.set('cells', buildCells(r.cells))
  return rm
}

function patchRow(rm: Y.Map<unknown>, r: NodeLayout['rows'][number]) {
  const src = r as unknown as Record<string, unknown>
  for (const k of [...rm.keys()]) if (k !== 'cells' && (!(k in src) || src[k] === undefined)) rm.delete(k)
  for (const [k, v] of Object.entries(src)) if (k !== 'cells' && v !== undefined && !sameJson(rm.get(k), v)) rm.set(k, v)
  const colsY = rm.get('cells')
  if (yCellShape(colsY) === cellShape(r.cells)) {
    ;(colsY as Y.Array<Y.Array<Y.Map<unknown>>>).forEach((ca, ci) => {
      ca.forEach((nm, ni) => patchNode(nm, r.cells[ci][ni]))
    })
  } else {
    rm.set('cells', buildCells(r.cells))
  }
}

/** Match `arr` to `targets` by key: drop what is gone or duplicated, patch what stayed, rebuild what
 *  moved. Order afterwards is exactly the target order. */
function reconcileKeyed<T>(
  arr: Y.Array<Y.Map<unknown>>,
  targets: T[],
  keyOf: (t: T) => string,
  yKeyOf: (m: Y.Map<unknown>) => unknown,
  build: (t: T) => Y.Map<unknown>,
  patch: (m: Y.Map<unknown>, t: T) => void,
) {
  const want = new Set(targets.map(keyOf))
  const seen = new Set<unknown>()
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr.get(i)
    const k = m instanceof Y.Map ? yKeyOf(m) : undefined
    if (!(m instanceof Y.Map) || typeof k !== 'string' || !want.has(k)) arr.delete(i, 1)
  }
  for (let i = 0; i < arr.length; i++) {
    const k = yKeyOf(arr.get(i))
    if (seen.has(k)) {
      arr.delete(i, 1)
      i--
    } else seen.add(k)
  }
  targets.forEach((t, i) => {
    const key = keyOf(t)
    const here = i < arr.length ? arr.get(i) : undefined
    if (here && yKeyOf(here) === key) {
      patch(here, t)
      return
    }
    for (let j = i + 1; j < arr.length; j++) {
      if (yKeyOf(arr.get(j)) === key) {
        arr.delete(j, 1)
        break
      }
    }
    arr.insert(i, [build(t)])
  })
}

/** Write `layout` onto `doc` as the smallest change. A doc with no usable structure is written whole. */
export function reconcileDoc(doc: Y.Doc, layout: NodeLayout): void {
  const root = doc.getMap(ROOT)
  const rowsY = root.get('rows')
  const benchY = root.get('bench')
  const metaY = root.get('meta')
  if (!(rowsY instanceof Y.Array) || !(benchY instanceof Y.Array) || !(metaY instanceof Y.Map)) {
    writeLayout(doc, layout)
    return
  }
  doc.transact(() => {
    reconcileKeyed(rowsY as Y.Array<Y.Map<unknown>>, layout.rows, (r) => (r as { id: string }).id, (m) => m.get('id'), buildRow, patchRow)
    reconcileKeyed(benchY as Y.Array<Y.Map<unknown>>, layout.bench, (n) => n.nid, (m) => m.get('nid'), nodeToMap, patchNode)
    if (layout.template === undefined) {
      if (metaY.get('template') !== undefined) metaY.delete('template')
    } else if (metaY.get('template') !== layout.template) metaY.set('template', layout.template)
  }, LOCAL_ORIGIN)
}

/** A fresh Y.Doc holding `layout`. */
export function toYDoc(layout: NodeLayout): Y.Doc {
  const doc = new Y.Doc()
  writeLayout(doc, layout)
  return doc
}

/** Read the document back as a plain `NodeLayout`. Total: a missing or mistyped part reads as empty,
 *  because a peer can send anything and validation lives at the snapshot boundary (see below). */
export function serializeLayout(doc: Y.Doc): NodeLayout {
  const root = doc.getMap(ROOT)
  const rowsY = root.get('rows')
  const benchY = root.get('bench')
  const metaY = root.get('meta')
  const rows = rowsY instanceof Y.Array
    ? (rowsY.toArray() as Y.Map<unknown>[]).filter((r) => r instanceof Y.Map).map((rm) => {
        const row: Record<string, unknown> = {}
        for (const [k, v] of rm.entries()) if (k !== 'cells') row[k] = v
        const colsY = rm.get('cells')
        row.cells = colsY instanceof Y.Array
          ? (colsY.toArray() as Y.Array<Y.Map<unknown>>[]).map((c) =>
              c instanceof Y.Array ? (c.toArray() as Y.Map<unknown>[]).filter((n) => n instanceof Y.Map).map(mapToNode) : [])
          : []
        return row
      })
    : []
  const bench = benchY instanceof Y.Array
    ? (benchY.toArray() as Y.Map<unknown>[]).filter((n) => n instanceof Y.Map).map(mapToNode)
    : []
  const out = { rows, bench } as unknown as NodeLayout
  const template = metaY instanceof Y.Map ? metaY.get('template') : undefined
  if (typeof template === 'string') out.template = template
  return out
}

/** Binary state for the debounced draft snapshot and for catching a joining peer up. */
export function encodeState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}

/** Apply a peer's update (or a stored snapshot). Tagged remote so it never enters anyone's undo. */
export function applyRemote(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update, REMOTE_ORIGIN)
}

/** One client's undo stack. Tracks ONLY `LOCAL_ORIGIN`, so undo reverts your edit and never a
 *  collaborator's; a shared undo stack is a defect (EDITOR-E0 §7). */
export function createClientUndo(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager(doc.getMap(ROOT), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 })
}

/** Apply a local edit as one undoable step. */
export function editLocal(doc: Y.Doc, fn: (root: Y.Map<unknown>) => void): void {
  doc.transact(() => fn(doc.getMap(ROOT)), LOCAL_ORIGIN)
}

// ── VALIDATION MOVES TO THE BOUNDARY ──────────────────────────────────────────────────────────
// The server cannot reject a CRDT edit: clients converge on their own, so an invalid intermediate
// state is normal. The snapshot-and-publish path must run `sanitizeNodeLayout` (node-ops.ts) over
// `serializeLayout(doc)` before anything is stored or published. This module never validates.
