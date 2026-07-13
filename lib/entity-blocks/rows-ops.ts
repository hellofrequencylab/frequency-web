import { entityBlockById, blocksForKind, type EntityKind } from './registry'
import { normalizeRowMargin, normalizeRowTitle, type RowDef, type RowColumns, type RowRatio } from './layout'
import type { BlockStyle, MarginStep } from './block-content'

// PURE ROWS MUTATION HELPERS for the on-page Profile page builder (ADR-516 Phase C → ADR-542). Every
// function is IMMUTABLE (returns a fresh BuilderLayout, never mutates its input) and TOTAL (a bad index /
// unknown id is a no-op, never a throw), and every result is re-run through `normalize` so the invariants
// always hold: at most MAX_ROWS rows; each row's `columns` in {1,2,3,4} with `cells.length === columns`;
// each column a STACK of KNOWN registry block ids (ADR-542), capped at MAX_STACK; a block id appears at
// most once across ALL rows; each row id a safe generated token, unique. Framework-free (no React / Next /
// Supabase), so the builder, the live grid, and the unit test share one source and it is trivially testable.
//
// The BENCH ("not shown") is DERIVED, never stored: palette − placed − hidden. `hidden` is the set of
// blocks kept in place but not rendered (the per-block "Hide"); benching a block removes it from its column
// so it falls back to the derived bench tray with its config intact.

const MAX_ROWS = 24
const MAX_STACK = 12
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
const ROW_ID_RE = /^r[0-9a-z]+$/i

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
}

/** The builder's working state: the freeform rows plus the hidden set, and the per-block authored content +
 *  style (ADR-528), both keyed by block id. Bench is derived (deriveBench). */
export interface BuilderLayout {
  rows: RowDef[]
  hidden: string[]
  content?: Record<string, Record<string, unknown>>
  style?: Record<string, BlockStyle>
}

/** A fresh, safe, unique row id (never a raw user key — matches ROW_ID_RE, deduped against `taken`). */
export function genRowId(taken: Iterable<string> = []): string {
  const used = new Set(taken)
  let id = ''
  do {
    id = `r${Math.random().toString(36).slice(2, 8)}`
  } while (used.has(id))
  return id
}

/**
 * Re-establish every invariant on a (possibly hand-mutated) layout. Total: clamps the row count, fixes
 * each row's `columns`/`cells` length, caps each column stack to MAX_STACK, drops unknown or duplicate
 * block ids, and regenerates any unsafe or duplicate row id. The hidden set is filtered to known ids and
 * deduped. Used as the final step of every mutation so the ops below can be written straightforwardly.
 */
export function normalize(layout: BuilderLayout): BuilderLayout {
  const seenBlocks = new Set<string>()
  const seenRowIds = new Set<string>()
  const rows: RowDef[] = []
  for (const raw of layout.rows.slice(0, MAX_ROWS)) {
    const columns: RowColumns = isRowColumns(raw.columns) ? raw.columns : 1
    const cells: string[][] = []
    for (let i = 0; i < columns; i++) {
      const stack: string[] = []
      for (const s of (raw.cells?.[i] ?? []).slice(0, MAX_STACK)) {
        if (typeof s === 'string' && entityBlockById(s) !== null && !seenBlocks.has(s)) {
          seenBlocks.add(s)
          stack.push(s)
        }
      }
      cells.push(stack)
    }
    let id = typeof raw.id === 'string' && ROW_ID_RE.test(raw.id) ? raw.id : genRowId(seenRowIds)
    if (seenRowIds.has(id)) id = genRowId(seenRowIds)
    seenRowIds.add(id)
    // The ratio only applies to a 2-column row; drop it otherwise, and keep only the sparse lead/trail split.
    const ratio: RowRatio | undefined =
      columns === 2 && (raw.ratio === 'lead' || raw.ratio === 'trail') ? raw.ratio : undefined
    const base = ratio ? { id, columns, cells, ratio } : { id, columns, cells }
    // Carry the row TITLE + live-header toggle (Fix 5) + margins (ADR-569 C3) through every mutation: trim +
    // bound the title, keep `headerOn` only as `true` beside a non-blank title, and keep only a non-neutral
    // margin step (the sparse stored shape).
    const title = normalizeRowTitle(raw.title)
    const withTitle: RowDef = title ? { ...base, title } : base
    if (title && raw.headerOn === true) withTitle.headerOn = true
    const mt = normalizeRowMargin(raw.mt)
    const mb = normalizeRowMargin(raw.mb)
    if (mt) withTitle.mt = mt
    if (mb) withTitle.mb = mb
    rows.push(withTitle)
  }
  const hidden = [...new Set(layout.hidden.filter((id) => entityBlockById(id) !== null))]
  // Content + style are keyed by block id and edited directly (not by row ops); carry them through
  // unchanged, keeping only known block-id keys (a retired id drops).
  const out: BuilderLayout = { rows, hidden }
  if (layout.content) {
    const content: Record<string, Record<string, unknown>> = {}
    for (const [id, props] of Object.entries(layout.content)) if (entityBlockById(id)) content[id] = props
    if (Object.keys(content).length) out.content = content
  }
  if (layout.style) {
    const style: Record<string, BlockStyle> = {}
    for (const [id, s] of Object.entries(layout.style)) if (entityBlockById(id)) style[id] = s
    if (Object.keys(style).length) out.style = style
  }
  return out
}

/** Set (or clear) a block's authored content bag. Passing an empty/undefined bag removes the entry. Keyed
 *  by block id; unknown ids are ignored. Immutable. */
export function setBlockContent(
  layout: BuilderLayout,
  blockId: string,
  props: Record<string, unknown> | undefined,
): BuilderLayout {
  if (entityBlockById(blockId) === null) return layout
  const content = { ...(layout.content ?? {}) }
  if (props && Object.keys(props).length) content[blockId] = props
  else delete content[blockId]
  return normalize({ ...layout, content })
}

/** Set (or clear) a block's style bag. Passing an empty/undefined style removes the entry. Immutable. */
export function setBlockStyle(
  layout: BuilderLayout,
  blockId: string,
  style: BlockStyle | undefined,
): BuilderLayout {
  if (entityBlockById(blockId) === null) return layout
  const styles = { ...(layout.style ?? {}) }
  if (style && Object.keys(style).length) styles[blockId] = style
  else delete styles[blockId]
  return normalize({ ...layout, style: styles })
}

/** Every block id currently placed in a row (any column, any depth). */
export function placedIds(rows: RowDef[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) for (const stack of row.cells) for (const s of stack) out.add(s)
  return out
}

/**
 * The derived BENCH: every block for the kind that is neither placed in a row nor hidden. Never stored —
 * always recomputed from the palette so a newly added registry block shows up in the tray automatically.
 */
export function deriveBench(layout: BuilderLayout, kind: EntityKind): string[] {
  const placed = placedIds(layout.rows)
  const hidden = new Set(layout.hidden)
  return blocksForKind(kind)
    .map((b) => b.id)
    .filter((id) => !placed.has(id) && !hidden.has(id))
}

/** An empty single-column row with a fresh id. */
function emptyRow(taken: Iterable<string>): RowDef {
  return { id: genRowId(taken), columns: 1, cells: [[]] }
}

/** Insert a new empty 1-column row at `at` (end when omitted). No-op at the MAX_ROWS cap. */
export function addRow(layout: BuilderLayout, at?: number): BuilderLayout {
  if (layout.rows.length >= MAX_ROWS) return layout
  const rows = [...layout.rows]
  const row = emptyRow(rows.map((r) => r.id))
  const index = at === undefined || at < 0 || at > rows.length ? rows.length : at
  rows.splice(index, 0, row)
  return normalize({ ...layout, rows })
}

/** Remove a row by id. Its blocks leave the rows and fall back to the derived bench (config intact). */
export function removeRow(layout: BuilderLayout, rowId: string): BuilderLayout {
  const rows = layout.rows.filter((r) => r.id !== rowId)
  if (rows.length === layout.rows.length) return layout
  return normalize({ ...layout, rows })
}

/** Move the row at `from` to index `to` (both clamped). Invalid indices are a no-op. */
export function moveRow(layout: BuilderLayout, from: number, to: number): BuilderLayout {
  const rows = [...layout.rows]
  if (from < 0 || from >= rows.length) return layout
  const dest = to < 0 ? 0 : to >= rows.length ? rows.length - 1 : to
  if (dest === from) return layout
  const [row] = rows.splice(from, 1)
  rows.splice(dest, 0, row)
  return normalize({ ...layout, rows })
}

/**
 * Set a row's column count. Preserves EVERY box (a column is a stack now, so nothing needs dropping):
 * widening pads with empty columns; narrowing MERGES the boxes of the dropped columns onto the last kept
 * column (left-to-right), so a 2→1 change stacks both columns into one. No-op for an unknown row id or an
 * out-of-range count.
 */
export function setRowColumns(layout: BuilderLayout, rowId: string, n: number): BuilderLayout {
  if (!isRowColumns(n)) return layout
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const cells: string[][] = []
    for (let i = 0; i < n; i++) cells.push([...(row.cells[i] ?? [])])
    // Narrowing: fold any dropped columns' boxes onto the last kept column so nothing is lost.
    if (n < row.columns) {
      for (let i = n; i < row.cells.length; i++) cells[n - 1].push(...row.cells[i])
    }
    // Leaving a 2-column row drops any lead ratio (normalize enforces this too; being explicit is cheap).
    const ratio = n === 2 ? row.ratio : undefined
    return { ...row, columns: n as RowColumns, cells, ratio }
  })
  return normalize({ ...layout, rows })
}

/** The four column layouts a SPACE section (row) can take, as ONE operator-facing choice (the on-canvas
 *  editor's layout picker binds to this):
 *   - `full`  — a single full-width column.
 *   - `even`  — two even 50 / 50 columns.
 *   - `lead`  — two columns, a WIDE lead column + a narrow rail (66 / 33).
 *   - `sidebar` — two columns, a SKINNY LEFT rail + a WIDE right main (33 / 66). The new layout added
 *     alongside the others; maps to the `trail` RowRatio the grid already renders (sm:grid-cols-[1fr_2fr]). */
export type RowSplit = 'full' | 'even' | 'lead' | 'sidebar'

/**
 * Set a section's column layout in ONE additive op (the on-canvas editor's layout picker). Composes the
 * existing primitives on a SINGLE layout value (so the ratio never lands on a stale pre-widen snapshot):
 * `full` merges the row back to one column (setRowColumns folds every box onto the kept column, so nothing
 * is lost); the three split choices widen to two columns and set the matching ratio. The new `sidebar`
 * choice is the skinny-left / wide-right split (the `trail` ratio, 33 / 66). No-op for an unknown row id.
 * Immutable — never rewrites setRowColumns / setRowRatio, only calls them.
 */
export function setRowSplit(layout: BuilderLayout, rowId: string, split: RowSplit): BuilderLayout {
  if (split === 'full') return setRowColumns(layout, rowId, 1)
  const widened = setRowColumns(layout, rowId, 2)
  const ratio: RowRatio = split === 'even' ? 'even' : split === 'lead' ? 'lead' : 'trail'
  return setRowRatio(widened, rowId, ratio)
}

/**
 * Set a 2-column row's split ratio ('even' = 50/50, 'lead' = 66/33 with a wider first column). A no-op
 * for an unknown row id or a row that is not 2 columns (the ratio has no meaning otherwise). Immutable.
 */
export function setRowRatio(layout: BuilderLayout, rowId: string, ratio: RowRatio): BuilderLayout {
  const rows = layout.rows.map((row) =>
    row.id === rowId && row.columns === 2 ? { ...row, ratio } : row,
  )
  return normalize({ ...layout, rows })
}

/**
 * Set a row's editable TITLE (Fix 5). Trimmed + bounded on write (normalizeRowTitle); a blank title clears
 * both the title AND the live-header toggle (an untitled row can't show a header). No-op for an unknown row
 * id. Immutable.
 */
export function setRowTitle(layout: BuilderLayout, rowId: string, title: string): BuilderLayout {
  const clean = normalizeRowTitle(title)
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const next: RowDef = { ...row }
    if (clean) next.title = clean
    else {
      delete next.title
      delete next.headerOn // no title → no live header
    }
    return next
  })
  return normalize({ ...layout, rows })
}

/**
 * Toggle whether a row's title renders as a section header on the LIVE page (Fix 5). Persisted only as
 * `true`, and only beside a non-blank title; turning it off (or a row with no title) drops the flag so the
 * title stays a pure editor label. No-op for an unknown row id. Immutable.
 */
export function setRowHeaderOn(layout: BuilderLayout, rowId: string, on: boolean): BuilderLayout {
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const next: RowDef = { ...row }
    if (on && normalizeRowTitle(row.title)) next.headerOn = true
    else delete next.headerOn
    return next
  })
  return normalize({ ...layout, rows })
}

/**
 * Set a row's top or bottom MARGIN (ADR-569 C3). `edge` picks the side; a neutral `none` clears the step so
 * the stored shape stays sparse (normalize re-drops it too). No-op for an unknown row id. Immutable.
 */
export function setRowMargin(
  layout: BuilderLayout,
  rowId: string,
  edge: 'mt' | 'mb',
  step: MarginStep,
): BuilderLayout {
  const clean = normalizeRowMargin(step)
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const next: RowDef = { ...row }
    if (clean) next[edge] = clean
    else delete next[edge]
    return next
  })
  return normalize({ ...layout, rows })
}

/** Remove `blockId` from wherever it sits (any column, any depth) — immutable. */
function clearFromRows(rows: RowDef[], blockId: string): RowDef[] {
  return rows.map((row) => {
    if (!row.cells.some((stack) => stack.includes(blockId))) return row
    return { ...row, cells: row.cells.map((stack) => stack.filter((s) => s !== blockId)) }
  })
}

/**
 * Place `blockId` into (rowId, colIndex) at stack position `index` (append when omitted / out of range).
 * Works from the bench OR as a move from another column: the block is first cleared from any current
 * position and from `hidden`, then inserted. No-op for an unknown block id, unknown row, or out-of-range
 * column.
 */
export function placeBlock(
  layout: BuilderLayout,
  blockId: string,
  rowId: string,
  colIndex: number,
  index?: number,
): BuilderLayout {
  if (entityBlockById(blockId) === null) return layout
  const target = layout.rows.find((r) => r.id === rowId)
  if (!target || colIndex < 0 || colIndex >= target.columns) return layout
  const cleared = clearFromRows(layout.rows, blockId)
  const rows = cleared.map((row) => {
    if (row.id !== rowId) return row
    const cells = row.cells.map((stack, i) => {
      if (i !== colIndex) return stack
      const next = [...stack]
      const at = index === undefined || index < 0 || index > next.length ? next.length : index
      next.splice(at, 0, blockId)
      return next
    })
    return { ...row, cells }
  })
  const hidden = layout.hidden.filter((id) => id !== blockId)
  // Carry the per-block content + style THROUGH the move (bug fix: a reorder / place must never drop the
  // block's authored bag). content/style are keyed by block id, independent of slot, so spreading `...layout`
  // keeps every block's entry — including the one being moved — intact across the placement.
  return normalize({ ...layout, rows, hidden })
}

/** Move a placed block to a new column/position. Alias of placeBlock. */
export function moveBlock(
  layout: BuilderLayout,
  blockId: string,
  rowId: string,
  colIndex: number,
  index?: number,
): BuilderLayout {
  return placeBlock(layout, blockId, rowId, colIndex, index)
}

/**
 * Nudge a placed block one step within its OWN column stack (delta -1 = up, +1 = down). Swaps it with its
 * neighbour. A no-op at the ends, or for an unplaced id. The primary "reorder within a column" control.
 */
export function nudgeBox(layout: BuilderLayout, blockId: string, delta: number): BuilderLayout {
  for (const row of layout.rows) {
    for (let c = 0; c < row.cells.length; c++) {
      const stack = row.cells[c]
      const idx = stack.indexOf(blockId)
      if (idx === -1) continue
      const to = idx + delta
      if (to < 0 || to >= stack.length) return layout
      const rows = layout.rows.map((rw) =>
        rw.id === row.id
          ? {
              ...rw,
              cells: rw.cells.map((s, i) => {
                if (i !== c) return s
                const next = [...s]
                ;[next[idx], next[to]] = [next[to], next[idx]]
                return next
              }),
            }
          : rw,
      )
      return normalize({ ...layout, rows })
    }
  }
  return layout
}

/** Send a block to the bench: free its slot (config is kept elsewhere). Leaves `hidden` untouched. */
export function benchBlock(layout: BuilderLayout, blockId: string): BuilderLayout {
  const rows = clearFromRows(layout.rows, blockId)
  return normalize({ ...layout, rows })
}

/** Hide a placed block: keep it in its slot but drop it from the render (adds to `hidden`, deduped). */
export function hideBlock(layout: BuilderLayout, blockId: string): BuilderLayout {
  if (entityBlockById(blockId) === null || layout.hidden.includes(blockId)) return layout
  return normalize({ ...layout, hidden: [...layout.hidden, blockId] })
}

/** Unhide a block (remove it from `hidden`). */
export function unhideBlock(layout: BuilderLayout, blockId: string): BuilderLayout {
  if (!layout.hidden.includes(blockId)) return layout
  return normalize({ ...layout, hidden: layout.hidden.filter((id) => id !== blockId) })
}

/** Fully remove a block (the confirm-gated Delete): free its slot, clear any hidden flag, AND drop its
 *  authored content + style (a permanent delete, so its bag goes with it). Every OTHER block's content +
 *  style is preserved (spread `...layout`, then delete just this block's entries). */
export function removeBlock(layout: BuilderLayout, blockId: string): BuilderLayout {
  const rows = clearFromRows(layout.rows, blockId)
  const hidden = layout.hidden.filter((id) => id !== blockId)
  const content = layout.content ? { ...layout.content } : undefined
  if (content) delete content[blockId]
  const style = layout.style ? { ...layout.style } : undefined
  if (style) delete style[blockId]
  return normalize({ ...layout, rows, hidden, content, style })
}
