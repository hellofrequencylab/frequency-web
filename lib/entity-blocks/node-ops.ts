// NODE OPS — E0 task 11 (docs/EDITOR-E0.md §1.5 steps 5 and 8). The mutations rows-ops.ts performs on
// block ids, performed on NODES instead, plus the write guard and the render resolver for a node
// document. Every function here is PURE (no React / Next / Supabase), IMMUTABLE (a fresh NodeLayout,
// never a mutated input) and TOTAL (a bad id or index is a no-op, never a throw), and every result is
// re-run through `normalizeNodeLayout` so the invariants always hold, exactly as rows-ops does.
//
// ── WHAT A NODE CHANGES ────────────────────────────────────────────────────────────────────────────
//
// rows-ops addresses a placement by its block id, so "move the Text block" is ambiguous the moment a
// page holds two (legal since task 10, lib/entity-blocks/block-limits.ts), and its content/style live
// in sibling maps keyed by that same id, so two Text blocks share one bag. A `BlockNode` carries its
// own `nid`, its own `content` and `style`, and its own `hidden` flag, so every op below takes a `nid`
// and the bags travel with the node: bench a node and its bag goes to the bench, delete it and the bag
// goes with it, place two of a type and each keeps its own words.
//
// ── THE SECURITY PROPERTY THIS KEEPS (docs/EDITOR-E0.md §1.2) ──────────────────────────────────────
//
// There is no `Record<nid, …>` anywhere. `cells` and `bench` are ARRAYS of node objects, so a node id
// that arrives over the wire is only ever compared, never used as a property name to write through
// (CodeQL js/remote-property-injection). `sanitizeNodeLayout` sanitizes each node's bag with the
// per-type `sanitizeBlockContent(node.type, …)`, which iterates that block's declared FieldDefs, so
// every written key is a fixed registry value. That is what retires `sanitizeContentMap` /
// `sanitizeStyleMap` for node documents: there is no map to iterate.
//
// ── WHAT THIS MODULE DOES NOT DO (and which task does) ─────────────────────────────────────────────
//
// · It switches no writer and no renderer. The Space, member, email and nurture actions still write the
//   legacy type-keyed document behind the LIVE-875 / LIVE-887 / LIVE-877 compatibility boundaries, and
//   the grid still renders `RowDef`. Task 12 (`renderNode`, `selectedNid`) and task 14 (actions, routes)
//   adopt these functions behind the `render_path` flag. Until then nothing stored changes shape.
// · It never discards a node whose type left the registry (ADR-978). An unknown type round-trips
//   byte-for-byte through every op and through `sanitizeNodeLayout`, and `resolveNodeRows` simply
//   does not render it. Legality of a KNOWN type (kind, per-type cap) is enforced as it is today.

import {
  NODE_ID_RE,
  nodeIdFor,
  placedSeed,
  benchSeed,
  upgradeLayout,
  type BlockNode,
  type NodeLayout,
} from './node-tree'
import { entityBlockById, blockSupportsKind, type EntityKind } from './registry'
import { sanitizeBlockContent, sanitizeBlockStyle, type BlockStyle, type MarginStep } from './block-content'
import { maxColumnsForKind, normalizeRowMargin, normalizeRowTitle, type RowColumns, type RowRatio } from './layout'
import { entityBlockLimit, typeLimiter } from './block-limits'

/** One row of a node document. `NodeLayout['rows'][number]`, named so the ops below read plainly. */
export type NodeRow = NodeLayout['rows'][number]

// The same bounds node-tree.ts and rows-ops.ts enforce, so a mutated document is never larger than an
// upgraded one.
const MAX_ROWS = 24
const MAX_STACK = 12
const MAX_BENCH = 48
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
const ROW_ID_RE = /^r[0-9a-z]+$/i

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
}

function plainObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** A fresh node id for a NEW placement (one added from the palette, which has no stored coordinates to
 *  hash). Random, unlike `nodeIdFor`, because a new node has no seed that two runs could agree on; it is
 *  minted once and then stable for the life of the placement. Matches NODE_ID_RE, avoids `taken`. */
export function genNodeId(taken: Iterable<string> = []): string {
  const used = new Set(taken)
  let id = ''
  do {
    id = `n${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`
  } while (used.has(id) || !NODE_ID_RE.test(id))
  return id
}

/** Every node id in a layout, placed then benched. */
function takenIds(layout: NodeLayout): Set<string> {
  const out = new Set<string>()
  for (const row of layout.rows) for (const stack of row.cells) for (const n of stack) out.add(n.nid)
  for (const n of layout.bench) out.add(n.nid)
  return out
}

/** Copy a node keeping only the fields the shape allows, with a (possibly re-minted) id. Bags are kept
 *  by REFERENCE, never re-keyed: an unknown type's bag has no schema to rewrite, and a known type's bag
 *  is rewritten by `sanitizeNodeLayout`, not here. */
function cleanNode(raw: unknown, nid: string): BlockNode | null {
  const o = plainObject(raw)
  if (!o || typeof o.type !== 'string' || !o.type) return null
  const node: BlockNode = { nid, type: o.type }
  const content = plainObject(o.content)
  if (content && Object.keys(content).length) node.content = content
  const style = plainObject(o.style)
  if (style && Object.keys(style).length) node.style = style as BlockStyle
  if (o.hidden === true) node.hidden = true
  return node
}

/**
 * Re-establish every invariant on a (possibly hand-mutated) node layout. Total. Clamps the row count,
 * fixes each row's `columns` / `cells` length, caps each stack and the bench, re-mints a missing,
 * malformed or duplicate node id DETERMINISTICALLY from the node's coordinates (so a fixed document
 * normalizes the same way twice), holds each KNOWN type to its per-type cap across the placed rows
 * (bench nodes are not placements and do not count), regenerates unsafe or duplicate row ids, and
 * carries the row title, header toggle, ratio and margins the way rows-ops `normalize` does. An
 * unknown type is kept (ADR-978). Idempotent: `normalizeNodeLayout(normalizeNodeLayout(x))` equals
 * `normalizeNodeLayout(x)`.
 */
export function normalizeNodeLayout(layout: NodeLayout): NodeLayout {
  const taken = new Set<string>()
  const admit = typeLimiter()
  const seenRowIds = new Set<string>()
  const rows: NodeRow[] = []
  for (const raw of (Array.isArray(layout.rows) ? layout.rows : []).slice(0, MAX_ROWS)) {
    const o = plainObject(raw)
    if (!o) continue
    const columns: RowColumns = isRowColumns(o.columns) ? o.columns : 1
    // A missing, unsafe or duplicate row id is regenerated POSITIONALLY (as parseRows does), not randomly,
    // so normalizing the same document twice yields the same rows; a random id would make this
    // function non-idempotent and churn `layout-equal` on every read.
    let id = typeof o.id === 'string' && ROW_ID_RE.test(o.id) ? o.id : `r${rows.length}`
    while (seenRowIds.has(id)) id = `${id}x`
    seenRowIds.add(id)
    const rawCells = Array.isArray(o.cells) ? o.cells : []
    const cells: BlockNode[][] = []
    for (let col = 0; col < columns; col++) {
      const stack: BlockNode[] = []
      const source = Array.isArray(rawCells[col]) ? (rawCells[col] as unknown[]).slice(0, MAX_STACK) : []
      for (const entry of source) {
        const read = plainObject(entry)
        if (!read || typeof read.type !== 'string' || !read.type) continue
        if (!admit(read.type)) continue
        const existing = typeof read.nid === 'string' && NODE_ID_RE.test(read.nid) && !taken.has(read.nid) ? read.nid : null
        const nid = existing ?? nodeIdFor(placedSeed(id, col, stack.length, read.type), taken)
        const node = cleanNode(read, nid)
        if (!node) continue
        taken.add(nid)
        stack.push(node)
      }
      cells.push(stack)
    }
    const ratio: RowRatio | undefined =
      columns === 2 && (o.ratio === 'lead' || o.ratio === 'trail') ? o.ratio : undefined
    const row: NodeRow = ratio ? { id, columns, cells, ratio } : { id, columns, cells }
    const title = normalizeRowTitle(o.title)
    if (title) row.title = title
    if (title && o.headerOn === true) row.headerOn = true
    const mt = normalizeRowMargin(o.mt)
    const mb = normalizeRowMargin(o.mb)
    if (mt) row.mt = mt
    if (mb) row.mb = mb
    rows.push(row)
  }
  const bench: BlockNode[] = []
  for (const entry of (Array.isArray(layout.bench) ? layout.bench : []).slice(0, MAX_BENCH)) {
    const read = plainObject(entry)
    if (!read || typeof read.type !== 'string' || !read.type) continue
    const existing = typeof read.nid === 'string' && NODE_ID_RE.test(read.nid) && !taken.has(read.nid) ? read.nid : null
    const nid = existing ?? nodeIdFor(`${benchSeed(read.type)}:${bench.length}`, taken)
    const node = cleanNode(read, nid)
    if (!node) continue
    taken.add(nid)
    bench.push(node)
  }
  const out: NodeLayout = { rows, bench }
  if (typeof layout.template === 'string') out.template = layout.template
  return out
}

/** Where a node sits: a placed position, the bench, or nowhere. */
type NodePosition = { where: 'placed'; rowId: string; col: number; index: number } | { where: 'bench'; index: number }

export function findNode(layout: NodeLayout, nid: string): NodePosition | null {
  for (const row of layout.rows) {
    for (let col = 0; col < row.cells.length; col++) {
      const index = row.cells[col].findIndex((n) => n.nid === nid)
      if (index !== -1) return { where: 'placed', rowId: row.id, col, index }
    }
  }
  const index = layout.bench.findIndex((n) => n.nid === nid)
  return index === -1 ? null : { where: 'bench', index }
}

/** The node itself, placed or benched, or null. */
export function getNode(layout: NodeLayout, nid: string): BlockNode | null {
  for (const row of layout.rows) for (const stack of row.cells) for (const n of stack) if (n.nid === nid) return n
  return layout.bench.find((n) => n.nid === nid) ?? null
}

/** How many PLACED nodes of `type` the layout holds (bench nodes are not placements). */
export function countPlaced(layout: NodeLayout, type: string): number {
  let n = 0
  for (const row of layout.rows) for (const stack of row.cells) for (const node of stack) if (node.type === type) n++
  return n
}

/** Whether one more PLACED node of `type` fits under its per-type cap (block-limits.ts). An unknown type
 *  reads as unlimited here only in the arithmetic sense; `addNode` refuses it because it is not insertable. */
export function canPlaceType(layout: NodeLayout, type: string): boolean {
  const limit = entityBlockLimit(type)
  return limit === null || countPlaced(layout, type) < limit
}

/** Lift `nid` out of wherever it sits (rows or bench), returning the layout without it and the node. */
function detach(layout: NodeLayout, nid: string): { layout: NodeLayout; node: BlockNode } | null {
  const node = getNode(layout, nid)
  if (!node) return null
  const rows = layout.rows.map((row) =>
    row.cells.some((stack) => stack.some((n) => n.nid === nid))
      ? { ...row, cells: row.cells.map((stack) => stack.filter((n) => n.nid !== nid)) }
      : row,
  )
  const bench = layout.bench.filter((n) => n.nid !== nid)
  return { layout: { ...layout, rows, bench }, node }
}

/** Insert `node` into (rowId, col) at `index` (append when omitted / out of range). No-op for an unknown
 *  row or an out-of-range column. */
function insert(layout: NodeLayout, node: BlockNode, rowId: string, col: number, index?: number): NodeLayout | null {
  const target = layout.rows.find((r) => r.id === rowId)
  if (!target || col < 0 || col >= target.columns) return null
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const cells = row.cells.map((stack, i) => {
      if (i !== col) return stack
      const next = [...stack]
      const at = index === undefined || index < 0 || index > next.length ? next.length : index
      next.splice(at, 0, node)
      return next
    })
    return { ...row, cells }
  })
  return { ...layout, rows }
}

/**
 * Add a NEW node of a registry `type` from the palette into (rowId, col, index). Refuses an unknown type
 * (the palette never offers one) and a type at its per-type cap, so two Offerings cannot be added and a
 * second Text can. Returns the layout and the new node's id, or the input layout and null.
 */
export function addNode(
  layout: NodeLayout,
  type: string,
  rowId: string,
  col: number,
  index?: number,
): { layout: NodeLayout; nid: string | null } {
  if (entityBlockById(type) === null || !canPlaceType(layout, type)) return { layout, nid: null }
  const nid = genNodeId(takenIds(layout))
  const next = insert(layout, { nid, type }, rowId, col, index)
  return next ? { layout: normalizeNodeLayout(next), nid } : { layout, nid: null }
}

/** Move node `nid` (from a row or the bench) to (rowId, col, index). Its bags travel with it. No-op for an
 *  unknown node, row or column. Moving a node never trips its own per-type cap, because it is detached
 *  before it is counted. */
export function placeNode(layout: NodeLayout, nid: string, rowId: string, col: number, index?: number): NodeLayout {
  const lifted = detach(layout, nid)
  if (!lifted) return layout
  const next = insert(lifted.layout, lifted.node, rowId, col, index)
  return next ? normalizeNodeLayout(next) : layout
}

/** Nudge a placed node one step within its own column stack (delta -1 up, +1 down). A no-op at the ends,
 *  on the bench, or for an unknown node. */
export function nudgeNode(layout: NodeLayout, nid: string, delta: number): NodeLayout {
  const at = findNode(layout, nid)
  if (!at || at.where !== 'placed') return layout
  const row = layout.rows.find((r) => r.id === at.rowId)!
  const stack = row.cells[at.col]
  const to = at.index + delta
  if (to < 0 || to >= stack.length) return layout
  const rows = layout.rows.map((rw) => {
    if (rw.id !== row.id) return rw
    const cells = rw.cells.map((s, i) => {
      if (i !== at.col) return s
      const next = [...s]
      ;[next[at.index], next[to]] = [next[to], next[at.index]]
      return next
    })
    return { ...rw, cells }
  })
  return normalizeNodeLayout({ ...layout, rows })
}

/** Send a placed node to the STORED bench with its content and style intact. This is the mechanic
 *  rows-ops.ts:13-15 described and could not deliver, because a benched block had no identity off the row.
 *  No-op for a node already on the bench or unknown. */
export function benchNode(layout: NodeLayout, nid: string): NodeLayout {
  const at = findNode(layout, nid)
  if (!at || at.where !== 'placed') return layout
  const lifted = detach(layout, nid)!
  return normalizeNodeLayout({ ...lifted.layout, bench: [...lifted.layout.bench, lifted.node] })
}

/** Hide ONE node (it stays in place, the render skips it). Replaces the document-level `hidden: string[]`,
 *  which could only hide every placement of a type. */
export function hideNode(layout: NodeLayout, nid: string): NodeLayout {
  return setNodeFlag(layout, nid, true)
}

export function unhideNode(layout: NodeLayout, nid: string): NodeLayout {
  return setNodeFlag(layout, nid, false)
}

function setNodeFlag(layout: NodeLayout, nid: string, hidden: boolean): NodeLayout {
  const node = getNode(layout, nid)
  if (!node || (node.hidden === true) === hidden) return layout
  return mapNode(layout, nid, (n) => {
    const next: BlockNode = { ...n }
    if (hidden) next.hidden = true
    else delete next.hidden
    return next
  })
}

/** Permanently remove a node (placed or benched) together with its bags. */
export function removeNode(layout: NodeLayout, nid: string): NodeLayout {
  const lifted = detach(layout, nid)
  return lifted ? normalizeNodeLayout(lifted.layout) : layout
}

/** Replace a node's authored content bag (an empty / undefined bag clears it). The bag is stored as given
 *  and sanitized on WRITE by `sanitizeNodeLayout`, exactly as rows-ops `setBlockContent` relies on
 *  `sanitizeEntityLayout` today. No-op for an unknown node. */
export function setNodeContent(layout: NodeLayout, nid: string, props: Record<string, unknown> | undefined): NodeLayout {
  if (!getNode(layout, nid)) return layout
  return mapNode(layout, nid, (n) => {
    const next: BlockNode = { ...n }
    if (props && Object.keys(props).length) next.content = props
    else delete next.content
    return next
  })
}

/** Replace a node's style bag (an empty / undefined style clears it). No-op for an unknown node. */
export function setNodeStyle(layout: NodeLayout, nid: string, style: BlockStyle | undefined): NodeLayout {
  if (!getNode(layout, nid)) return layout
  return mapNode(layout, nid, (n) => {
    const next: BlockNode = { ...n }
    if (style && Object.keys(style).length) next.style = style
    else delete next.style
    return next
  })
}

/** Apply `fn` to the one node with `nid`, wherever it sits. Immutable, then normalized. */
function mapNode(layout: NodeLayout, nid: string, fn: (n: BlockNode) => BlockNode): NodeLayout {
  const rows = layout.rows.map((row) =>
    row.cells.some((stack) => stack.some((n) => n.nid === nid))
      ? { ...row, cells: row.cells.map((stack) => stack.map((n) => (n.nid === nid ? fn(n) : n))) }
      : row,
  )
  const bench = layout.bench.map((n) => (n.nid === nid ? fn(n) : n))
  return normalizeNodeLayout({ ...layout, rows, bench })
}

// ── The write guard ───────────────────────────────────────────────────────────────────────────────

/** Sanitize one node for `kind`. A KNOWN type that does not support the kind is dropped (null); a known
 *  type's bags go through the per-type field sanitizers; an unknown type is kept verbatim (ADR-978). */
function sanitizeNode(node: BlockNode, kind: EntityKind): BlockNode | null {
  const block = entityBlockById(node.type)
  if (block === null) return node
  if (!blockSupportsKind(block, kind)) return null
  const out: BlockNode = { nid: node.nid, type: node.type }
  const content = sanitizeBlockContent(node.type, node.content)
  if (content) out.content = content
  const style = sanitizeBlockStyle(node.style)
  if (style) out.style = style
  if (node.hidden === true) out.hidden = true
  return out
}

/** Clamp a row to the kind's max columns by FOLDING the overflow stacks onto the last kept column, so a
 *  member document (one column) keeps every node an author placed in a wider row. The legacy
 *  `clampRowColumns` drops them; here they are nodes with bags, and dropping a bag is loss. */
function foldRowColumns(row: NodeRow, max: RowColumns): NodeRow {
  if (row.columns <= max) return row
  const cells = row.cells.slice(0, max).map((s) => [...s])
  for (let i = max; i < row.cells.length; i++) cells[max - 1].push(...row.cells[i])
  const next: NodeRow = { ...row, columns: max, cells }
  if (max !== 2) delete next.ratio
  return next
}

/**
 * Server-side WRITE guard for a node document, the node-shaped `sanitizeEntityLayout`. Never trusts the
 * wire: `upgradeLayout` reads any shape (legacy or node) into nodes; every KNOWN node's bags are rewritten
 * by its block's own field sanitizers; a wrong-kind known type is dropped; an unknown type is preserved
 * byte-for-byte (ADR-978); rows are folded to the kind's column maximum; the per-type cap holds across the
 * placed rows; the bench is kept and capped. Returns null when nothing usable survives (no rows, no
 * bench, no template), which is what the caller means by "clear the saved node".
 */
export function sanitizeNodeLayout(raw: unknown, kind: EntityKind): NodeLayout | null {
  const up = upgradeLayout(raw)
  if (!up) return null
  const max = maxColumnsForKind(kind)
  const rows: NodeRow[] = up.rows.map((row) => {
    const folded = foldRowColumns(row, max)
    return { ...folded, cells: folded.cells.map((stack) => stack.map((n) => sanitizeNode(n, kind)).filter((n): n is BlockNode => n !== null)) }
  })
  const bench = up.bench.map((n) => sanitizeNode(n, kind)).filter((n): n is BlockNode => n !== null)
  const out = normalizeNodeLayout({ ...up, rows, bench })
  if (!out.rows.length && !out.bench.length && !out.template) return null
  return out
}

// ── The render resolver ───────────────────────────────────────────────────────────────────────────

/** A row as the renderer sees it: only the nodes that draw (known, kind-valid, not hidden, within cap). */
export interface ResolvedNodeRow {
  id: string
  columns: RowColumns
  cells: BlockNode[][]
  ratio?: RowRatio
  title?: string
  headerOn?: boolean
  mt?: MarginStep
  mb?: MarginStep
}

/**
 * The EFFECTIVE rows a surface renders from a node document, the node-shaped `resolveRows`: hidden nodes,
 * unknown types and wrong-kind types draw nothing, the per-type cap holds, rows fold to the kind's column
 * maximum. Pure + total; an empty layout resolves to no rows (the caller picks a starter, as it does for
 * the legacy shape). The bench is never rendered.
 */
export function resolveNodeRows(layout: NodeLayout | null, kind: EntityKind): ResolvedNodeRow[] {
  if (!layout) return []
  const max = maxColumnsForKind(kind)
  const admit = typeLimiter()
  return normalizeNodeLayout(layout).rows.map((raw) => {
    const row = foldRowColumns(raw, max)
    const cells = row.cells.map((stack) =>
      stack.filter((n) => {
        if (n.hidden) return false
        const block = entityBlockById(n.type)
        return block !== null && blockSupportsKind(block, kind) && admit(n.type)
      }),
    )
    return { ...row, cells }
  })
}
