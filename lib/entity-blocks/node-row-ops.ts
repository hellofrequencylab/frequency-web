// NODE ROW OPS (E0 task 12b, ADR-1839). The row-level mutations rows-ops.ts performs on a BuilderLayout
// (add, remove, move, columns, ratio, title, header, margin), performed on a NodeLayout, so the node page
// builder can arrange sections without the legacy shape. Same contract as node-ops.ts: PURE, IMMUTABLE,
// TOTAL (an unknown row or a bad index is a no-op) and every result re-runs `normalizeNodeLayout`.
// Block-level ops (place, bench, hide, remove, content, style) already live in node-ops.ts.

import type { BlockNode, NodeLayout } from './node-tree'
import { normalizeNodeLayout, type NodeRow } from './node-ops'
import { normalizeRowMargin, normalizeRowTitle, type RowRatio } from './layout'
import type { MarginStep } from './block-content'

const MAX_ROWS = 24
const ROW_ID_RE = /^r[0-9a-z]+$/i

function freshRowId(taken: Iterable<string>): string {
  const used = new Set(taken)
  let id = ''
  do {
    id = `r${Math.random().toString(36).slice(2, 8)}`
  } while (used.has(id) || !ROW_ID_RE.test(id))
  return id
}

function mapRow(layout: NodeLayout, rowId: string, fn: (row: NodeRow) => NodeRow): NodeLayout {
  if (!layout.rows.some((r) => r.id === rowId)) return layout
  return normalizeNodeLayout({ ...layout, rows: layout.rows.map((r) => (r.id === rowId ? fn(r) : r)) })
}

/** Insert a new empty 1-column row at `at` (end when omitted). No-op at the row cap. */
export function addNodeRow(layout: NodeLayout, at?: number): NodeLayout {
  if (layout.rows.length >= MAX_ROWS) return layout
  const rows = [...layout.rows]
  const row: NodeRow = { id: freshRowId(rows.map((r) => r.id)), columns: 1, cells: [[]] }
  const index = at === undefined || at < 0 || at > rows.length ? rows.length : at
  rows.splice(index, 0, row)
  return normalizeNodeLayout({ ...layout, rows })
}

/** Remove a row. Its nodes go to the stored bench with their content and style intact. */
export function removeNodeRow(layout: NodeLayout, rowId: string): NodeLayout {
  const row = layout.rows.find((r) => r.id === rowId)
  if (!row) return layout
  const lifted: BlockNode[] = row.cells.flat()
  return normalizeNodeLayout({
    ...layout,
    rows: layout.rows.filter((r) => r.id !== rowId),
    bench: [...layout.bench, ...lifted],
  })
}

/** Move the row at `from` to index `to` (clamped). Invalid indices are a no-op. */
export function moveNodeRow(layout: NodeLayout, from: number, to: number): NodeLayout {
  const rows = [...layout.rows]
  if (from < 0 || from >= rows.length) return layout
  const dest = to < 0 ? 0 : to >= rows.length ? rows.length - 1 : to
  if (dest === from) return layout
  const [row] = rows.splice(from, 1)
  rows.splice(dest, 0, row)
  return normalizeNodeLayout({ ...layout, rows })
}

/** Set a row's column count (1 to 4). Widening pads with empty columns; narrowing folds the dropped
 *  columns' nodes onto the last kept column, so nothing is lost. */
export function setNodeRowColumns(layout: NodeLayout, rowId: string, n: number): NodeLayout {
  if (n !== 1 && n !== 2 && n !== 3 && n !== 4) return layout
  return mapRow(layout, rowId, (row) => {
    const cells: BlockNode[][] = []
    for (let i = 0; i < n; i++) cells.push([...(row.cells[i] ?? [])])
    if (n < row.columns) for (let i = n; i < row.cells.length; i++) cells[n - 1].push(...row.cells[i])
    const next: NodeRow = { ...row, columns: n, cells }
    if (n !== 2) delete next.ratio
    return next
  })
}

/** Set a 2-column row's split ratio. No-op for a row that is not 2 columns. */
export function setNodeRowRatio(layout: NodeLayout, rowId: string, ratio: RowRatio | 'even'): NodeLayout {
  return mapRow(layout, rowId, (row) => {
    if (row.columns !== 2) return row
    const next: NodeRow = { ...row }
    if (ratio === 'even') delete next.ratio
    else next.ratio = ratio
    return next
  })
}

/** Set a row's title. A blank title clears the title and the live-header toggle with it. */
export function setNodeRowTitle(layout: NodeLayout, rowId: string, title: string): NodeLayout {
  const clean = normalizeRowTitle(title)
  return mapRow(layout, rowId, (row) => {
    const next: NodeRow = { ...row }
    if (clean) next.title = clean
    else {
      delete next.title
      delete next.headerOn
    }
    return next
  })
}

/** Toggle whether a row's title renders as a header on the live page. Only beside a non-blank title. */
export function setNodeRowHeaderOn(layout: NodeLayout, rowId: string, on: boolean): NodeLayout {
  return mapRow(layout, rowId, (row) => {
    const next: NodeRow = { ...row }
    if (on && normalizeRowTitle(row.title)) next.headerOn = true
    else delete next.headerOn
    return next
  })
}

/** Set a row's top or bottom margin; `none` clears the step. */
export function setNodeRowMargin(layout: NodeLayout, rowId: string, edge: 'mt' | 'mb', step: MarginStep): NodeLayout {
  const clean = normalizeRowMargin(step)
  return mapRow(layout, rowId, (row) => {
    const next: NodeRow = { ...row }
    if (clean) next[edge] = clean
    else delete next[edge]
    return next
  })
}

/** A section's column layout as one choice (the on-canvas editor's picker): `full`, `even` (50/50), `lead`
 *  (66/33), or `sidebar` (33/66, the `trail` ratio). Composes the column and ratio ops on one layout value. */
export function setNodeRowSplit(layout: NodeLayout, rowId: string, split: 'full' | 'even' | 'lead' | 'sidebar'): NodeLayout {
  if (split === 'full') return setNodeRowColumns(layout, rowId, 1)
  const widened = setNodeRowColumns(layout, rowId, 2)
  return setNodeRowRatio(widened, rowId, split === 'even' ? 'even' : split === 'lead' ? 'lead' : 'trail')
}
