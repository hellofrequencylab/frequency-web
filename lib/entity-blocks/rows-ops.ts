import { entityBlockById, blocksForKind, type EntityKind } from './registry'
import type { RowDef, RowColumns } from './layout'

// PURE ROWS MUTATION HELPERS for the in-rail Profile page builder (ADR-516 Phase C). Every function is
// IMMUTABLE (returns a fresh BuilderLayout, never mutates its input) and TOTAL (a bad index / unknown id
// is a no-op, never a throw), and every result is re-run through `normalize` so the Phase A invariants
// always hold: at most MAX_ROWS rows; each row's `columns` in {1,2,3,4} with `slots.length === columns`;
// each cell null or a KNOWN registry block id; a block id appears at most once across ALL rows; each row
// id a safe generated token, unique. Framework-free (no React / Next / Supabase), so the builder, the
// live grid, and the unit test share one source and it is trivially testable.
//
// The BENCH ("not shown") is DERIVED, never stored (mirrors Phase A's note): palette − placed − hidden.
// `hidden` is the set of blocks kept in place but not rendered (the per-block "Hide"); benching a block
// removes it from its row so it falls back to the derived bench tray with its config intact.

/** The builder's working state: the freeform rows plus the hidden set. Bench is derived (deriveBench). */
export interface BuilderLayout {
  rows: RowDef[]
  hidden: string[]
}

const MAX_ROWS = 24
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
const ROW_ID_RE = /^r[0-9a-z]+$/i

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
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
 * Re-establish every Phase A invariant on a (possibly hand-mutated) layout. Total: clamps the row count,
 * fixes each row's `columns`/`slots` length, drops unknown or duplicate block ids to null, and regenerates
 * any unsafe or duplicate row id. The hidden set is filtered to known ids and deduped. Used as the final
 * step of every mutation so the ops below can be written straightforwardly.
 */
export function normalize(layout: BuilderLayout): BuilderLayout {
  const seenBlocks = new Set<string>()
  const seenRowIds = new Set<string>()
  const rows: RowDef[] = []
  for (const raw of layout.rows.slice(0, MAX_ROWS)) {
    const columns: RowColumns = isRowColumns(raw.columns) ? raw.columns : 1
    const slots: (string | null)[] = []
    for (let i = 0; i < columns; i++) {
      const s = raw.slots[i] ?? null
      if (typeof s === 'string' && entityBlockById(s) !== null && !seenBlocks.has(s)) {
        seenBlocks.add(s)
        slots.push(s)
      } else {
        slots.push(null)
      }
    }
    let id = typeof raw.id === 'string' && ROW_ID_RE.test(raw.id) ? raw.id : genRowId(seenRowIds)
    if (seenRowIds.has(id)) id = genRowId(seenRowIds)
    seenRowIds.add(id)
    rows.push({ id, columns, slots })
  }
  const hidden = [...new Set(layout.hidden.filter((id) => entityBlockById(id) !== null))]
  return { rows, hidden }
}

/** Every block id currently placed in a row (non-null cell). */
export function placedIds(rows: RowDef[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) for (const s of row.slots) if (s) out.add(s)
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
  return { id: genRowId(taken), columns: 1, slots: [null] }
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
 * Set a row's column count. Splits/merges the slots, preserving the row's blocks LEFT-TO-RIGHT: the first
 * `n` blocks keep their slots, any overflow (a wider row narrowed) is dropped from the row and falls to the
 * derived bench. Widening pads with empty slots. No-op for an unknown row id or an out-of-range count.
 */
export function setRowColumns(layout: BuilderLayout, rowId: string, n: number): BuilderLayout {
  if (!isRowColumns(n)) return layout
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const blocks = row.slots.filter((s): s is string => s !== null)
    const slots: (string | null)[] = []
    for (let i = 0; i < n; i++) slots.push(blocks[i] ?? null)
    return { ...row, columns: n, slots }
  })
  return normalize({ ...layout, rows })
}

/** Remove `blockId` from wherever it sits (any slot) — immutable. */
function clearFromRows(rows: RowDef[], blockId: string): RowDef[] {
  return rows.map((row) =>
    row.slots.includes(blockId)
      ? { ...row, slots: row.slots.map((s) => (s === blockId ? null : s)) }
      : row,
  )
}

/**
 * Place `blockId` into (rowId, colIndex). Works from the bench OR as a move from another slot: the block
 * is first cleared from any current slot and from `hidden`, then dropped in. If the target slot already
 * holds another block, that block is displaced to the derived bench (its cell is freed). No-op for an
 * unknown block id, unknown row, or out-of-range column.
 */
export function placeBlock(
  layout: BuilderLayout,
  blockId: string,
  rowId: string,
  colIndex: number,
): BuilderLayout {
  if (entityBlockById(blockId) === null) return layout
  const target = layout.rows.find((r) => r.id === rowId)
  if (!target || colIndex < 0 || colIndex >= target.columns) return layout
  const cleared = clearFromRows(layout.rows, blockId)
  const rows = cleared.map((row) =>
    row.id === rowId
      ? { ...row, slots: row.slots.map((s, i) => (i === colIndex ? blockId : s)) }
      : row,
  )
  const hidden = layout.hidden.filter((id) => id !== blockId)
  return normalize({ rows, hidden })
}

/** Move a placed block to a new slot. Alias of placeBlock (same displace-to-bench semantics). */
export function moveBlock(
  layout: BuilderLayout,
  blockId: string,
  rowId: string,
  colIndex: number,
): BuilderLayout {
  return placeBlock(layout, blockId, rowId, colIndex)
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

/**
 * Swap the contents of two cells (each addressed by row id + column index). Used by the per-block up/down
 * arrows: moving a block to its neighbour swaps them, so an empty neighbour is a plain move and an
 * occupied one exchanges places. No-op for an unknown row or out-of-range column.
 */
export function swapCells(
  layout: BuilderLayout,
  aRowId: string,
  aCol: number,
  bRowId: string,
  bCol: number,
): BuilderLayout {
  const a = layout.rows.find((r) => r.id === aRowId)
  const b = layout.rows.find((r) => r.id === bRowId)
  if (!a || !b || aCol < 0 || aCol >= a.columns || bCol < 0 || bCol >= b.columns) return layout
  const av = a.slots[aCol] ?? null
  const bv = b.slots[bCol] ?? null
  const rows = layout.rows.map((row) => {
    if (row.id === aRowId && row.id === bRowId) {
      const slots = [...row.slots]
      slots[aCol] = bv
      slots[bCol] = av
      return { ...row, slots }
    }
    if (row.id === aRowId) {
      const slots = [...row.slots]
      slots[aCol] = bv
      return { ...row, slots }
    }
    if (row.id === bRowId) {
      const slots = [...row.slots]
      slots[bCol] = av
      return { ...row, slots }
    }
    return row
  })
  return normalize({ ...layout, rows })
}

/** Fully remove a block (the confirm-gated Delete): free its slot AND clear any hidden flag. */
export function removeBlock(layout: BuilderLayout, blockId: string): BuilderLayout {
  const rows = clearFromRows(layout.rows, blockId)
  const hidden = layout.hidden.filter((id) => id !== blockId)
  return normalize({ rows, hidden })
}
