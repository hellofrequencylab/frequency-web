import { entityBlockById, blockSupportsKind, blocksForKind, type EntityKind } from './registry'
import { sanitizeContentMap, sanitizeStyleMap, type BlockStyle, type MarginStep } from './block-content'
import {
  isTemplateId,
  slotIds,
  defaultSlotId,
  DEFAULT_TEMPLATE,
  TEMPLATES,
  type TemplateId,
} from '@/lib/widgets/templates'

// The ONLY property names accepted as slot keys: the union of every template's slot ids. A saved
// layout is user-originated, so writing a slot object keyed by its raw keys is remote property
// injection (CodeQL js/remote-property-injection: a bad key like `__proto__` could pollute the
// prototype). Gating every slot-key write on this allowlist makes the written property name a fixed,
// safe value and drops any unknown slot as garbage.
const KNOWN_SLOT_IDS: ReadonlySet<string> = new Set(TEMPLATES.flatMap((t) => t.slots.map((s) => s.id)))

function isKnownSlotId(id: string): boolean {
  return KNOWN_SLOT_IDS.has(id)
}

// The GRID layout model for the unified entity-block system (ADR-508, U2b). Generalizes S3's
// single-column SavedProfileLayout (lib/spaces/profile-layout.ts, {order?,hidden?}) to carry a GRID: a
// TEMPLATE (from the module-engine template catalog) plus a per-SLOT ordered list of block ids. ONE
// model drives both a member (Spotlight) and a space (Spaces) grid editor, so the shared block-picker
// (components/entity-blocks/block-grid-editor.tsx) reads one shape. PURE + framework-independent (no
// React / Next / Supabase), so it is trivially unit-testable, like its S3 sibling.
//
// BACK-COMPATIBLE: a flat `order?: string[]` still works — it reads as the default slot of the Single
// template, so a value saved before the grid landed keeps rendering. FAIL-SAFE throughout: a malformed
// blob parses to null and the fresh default stands, so a bad row never breaks a profile.

// ── The FREEFORM ROWS model (ADR-516 Phase A) ───────────────────────────────────────────────────────
// The rows model supersedes the fixed 7-template catalog as the SOURCE OF TRUTH going forward: a layout
// is an ordered list of ROWS, each a horizontal band of up to 4 equal columns, and each column holds a
// single block id (or is empty). It is POSITIONAL (row index + column index), so unlike the legacy
// `slots` map it needs no string slot-key allowlist — a slot key can never reach an object property.
// The SHAPE is validated instead (bounded row count, columns in {1..4}, each cell a known block id or
// null, block ids deduped across all rows). `inactive` (blocks not placed on the page) is DERIVED, never
// stored: palette − (blocks in rows) − hidden.

/** A row's column count. Equal columns by default; the renderer stacks them on mobile and lays them N-up
 *  at lg. A 2-column row may carry a `ratio` to make the first column wider (see RowRatio). */
export type RowColumns = 1 | 2 | 3 | 4

/** A 2-column row's split (ignored for any other column count):
 *  - `even`  — 50 / 50 (the default; absent === even).
 *  - `lead`  — 66 / 33, the FIRST column wider (a lead column + a rail).
 *  - `trail` — 33 / 66, the SECOND column wider (a rail + a lead column). */
export type RowRatio = 'even' | 'lead' | 'trail'

/** One row of the freeform layout: `columns` columns, each a STACK of block ids (ADR-542). Invariant:
 *  `cells.length === columns`; each `cells[i]` is the ordered box ids stacked top-to-bottom in column i
 *  (an empty column is `[]`). A block id appears at most once across the WHOLE layout (global dedup). `id`
 *  is a safe generated token (see ROW_ID_RE), never used as an object key. `ratio` only applies when
 *  `columns === 2` (a wider lead column); absent means an even split.
 *
 *  ROW TITLE (Fix 5 / ADR-567): every row can carry an editable `title` — its NAME in the arranger (always
 *  visible so the operator can identify the row) — and a `headerOn` toggle that decides whether that title
 *  ALSO renders as a section header on the LIVE page. `headerOn` defaults OFF: a titled row is just labelled
 *  in the editor until the operator turns its live header on. Both live in the layout jsonb, no migration. */
export interface RowDef {
  id: string
  columns: RowColumns
  cells: string[][]
  ratio?: RowRatio
  /** The row's editable title (its name in the arranger; the live header text when `headerOn`). Trimmed +
   *  bounded to ROW_TITLE_MAX on read. Absent = an untitled row. */
  title?: string
  /** Render `title` as a section header on the LIVE page. Persisted only as `true`; absent/false = the
   *  header-less default (the title still shows in the editor as the row's name). */
  headerOn?: boolean
  /** Per-row top / bottom MARGIN (ADR-569 C3): extra space above / below the whole row band, on top of the
   *  grid's base rhythm. A valid step or absent (no extra space). Token-driven; no migration (jsonb). */
  mt?: MarginStep
  mb?: MarginStep
}

/** The row title is user-originated; bound it on every read (mirrors ADR-562's ROW_HEADER_MAX). */
export const ROW_TITLE_MAX = 80

/** Read + bound a saved row title to a trimmed, capped string, or undefined when blank. Pure + total. */
export function normalizeRowTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().slice(0, ROW_TITLE_MAX)
  return t.length ? t : undefined
}

/** Whether a row shows a header on the LIVE page: the toggle is on AND the title is non-blank. The single
 *  source both the renderer and the "does this layout have config" check read. */
export function rowShowsHeader(row: Pick<RowDef, 'title' | 'headerOn'>): boolean {
  return row.headerOn === true && !!normalizeRowTitle(row.title)
}

/** The valid per-row margin steps (mirrors the block-content MarginStep set). */
const ROW_MARGIN_VALUES: ReadonlySet<string> = new Set(['none', 'sm', 'md', 'lg', 'xl'])

/** Read + validate a per-row margin step (ADR-569 C3), or undefined when absent / garbage / the neutral
 *  `none` default (kept sparse). Pure + total. */
export function normalizeRowMargin(raw: unknown): MarginStep | undefined {
  if (typeof raw !== 'string' || !ROW_MARGIN_VALUES.has(raw) || raw === 'none') return undefined
  return raw as MarginStep
}

/** Attach a trimmed title + headerOn flag + margins to a built RowDef, keeping the stored shape sparse (a
 *  blank title, an off/absent toggle, or a neutral margin is dropped). Used by every row-building path so
 *  title/toggle/margins carry through parse, sanitize, resolve, and the rows ops uniformly. */
function withRowMeta(row: RowDef, title: unknown, headerOn: unknown, mt?: unknown, mb?: unknown): RowDef {
  const t = normalizeRowTitle(title)
  const out: RowDef = { ...row }
  if (t) out.title = t
  else delete out.title
  if (t && headerOn === true) out.headerOn = true
  else delete out.headerOn
  const top = normalizeRowMargin(mt)
  const bottom = normalizeRowMargin(mb)
  if (top) out.mt = top
  else delete out.mt
  if (bottom) out.mb = bottom
  else delete out.mb
  return out
}

/** Max boxes stacked in one column (bound on user-originated data). */
const MAX_STACK = 12

/** The maximum columns a kind's page builder may use. The MEMBER profile is a single-column block LIST
 *  (no layout editor) — every row is one block. The SPACE profile is a two-column layout editor (with a
 *  per-row 50/50 or 66/33 split). This is the AUTHORITY: the server sanitize clamps a saved layout to it,
 *  and the renderer clamps on read, so a member layout can never persist / render more than one column and
 *  a space never more than two. */
export const MAX_COLUMNS_BY_KIND: Record<EntityKind, RowColumns> = {
  member: 1,
  space: 2,
  // Email (Email Studio, 2026) stacks a single vertical column of sections. One column is the safe, universal
  // email layout that renders identically across every mail client (multi-column can come later); the email
  // renderer never emits a side-by-side grid.
  email: 1,
}

/** The max columns for a kind (see MAX_COLUMNS_BY_KIND). */
export function maxColumnsForKind(kind: EntityKind): RowColumns {
  return MAX_COLUMNS_BY_KIND[kind]
}

/** A valid RowRatio, or undefined. `even` is normalized to undefined (the absent default) so the stored
 *  shape stays minimal; only a genuine `lead` split is ever persisted. Non-2-column callers pass columns
 *  so the ratio is dropped when it cannot apply. */
function normalizeRatio(raw: unknown, columns: number): RowRatio | undefined {
  if (columns !== 2) return undefined
  return raw === 'lead' || raw === 'trail' ? raw : undefined
}

/** The operator's saved GRID arrangement, persisted per surface (space → spaces.preferences.profileLayout,
 *  member → profiles.meta). Every key optional so a partial blob is valid. */
export interface EntityLayout {
  /** NEW (ADR-516): the freeform rows — the source of truth going forward. */
  rows?: RowDef[]
  /** KEPT: the starter template a layout began from / the legacy interior template. Absent = single-column. */
  template?: TemplateId
  /** KEPT (legacy read path): slot id (e.g. 'main','side','top','col-1') → the ordered block ids in it. */
  slots?: Record<string, string[]>
  /** Block ids toggled off (dropped from the render). */
  hidden?: string[]
  /** Back-compat single-column fallback: a flat ordered id list = the default slot. */
  order?: string[]
  /** Per-block authored content (ADR-528), keyed by block id. Validated on parse + sanitize. */
  content?: Record<string, Record<string, unknown>>
  /** Per-block style (ADR-528), keyed by block id. Validated on parse + sanitize. */
  style?: Record<string, BlockStyle>
}

// Rows-shape validation bounds. A layout is user-originated, so every bound is enforced on parse.
const MAX_ROWS = 24
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
/** A safe generated row id (never a raw user key). Anything else is regenerated positionally. */
const ROW_ID_RE = /^r[0-9a-z]+$/i

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
}

/** Read the raw per-column stacks off a saved row, accepting BOTH the new `cells` shape (a list of stacks)
 *  and the legacy `slots` shape (one id-or-null per column, ADR-516). Returns a list of raw stacks aligned
 *  to nothing yet (the caller clamps to `columns`). */
function rawCells(o: { cells?: unknown; slots?: unknown }): unknown[][] {
  if (Array.isArray(o.cells)) return o.cells.map((c) => (Array.isArray(c) ? c : []))
  // Legacy: `slots` was `(string|null)[]`, one cell per column → each becomes a 1-deep stack (or empty).
  if (Array.isArray(o.slots)) return o.slots.map((s) => (typeof s === 'string' ? [s] : []))
  return []
}

/**
 * Fail-safe read of a saved `rows` array. Validates the SHAPE (positional, so no slot-key allowlist):
 * clamps to MAX_ROWS; drops a row whose `columns` is not in {1,2,3,4}; clamps each row's stacks to its
 * `columns` and each stack to MAX_STACK; keeps a box only when it is a KNOWN registry block id (kind-
 * agnostic here — kind filtering is applied in sanitize/resolve); dedupes a block id across ALL rows (a
 * later repeat is dropped); and regenerates any id that is not a safe token. Accepts the legacy `slots`
 * shape (one id per column) via rawCells. Returns null when nothing usable survives.
 */
function parseRows(raw: unknown): RowDef[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: RowDef[] = []
  for (const r of raw.slice(0, MAX_ROWS)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const o = r as {
      id?: unknown
      columns?: unknown
      cells?: unknown
      slots?: unknown
      ratio?: unknown
      title?: unknown
      headerOn?: unknown
      mt?: unknown
      mb?: unknown
    }
    if (!isRowColumns(o.columns)) continue
    const columns = o.columns
    const raws = rawCells(o)
    const cells: string[][] = []
    for (let i = 0; i < columns; i++) {
      const stack: string[] = []
      for (const s of Array.isArray(raws[i]) ? raws[i].slice(0, MAX_STACK) : []) {
        if (typeof s === 'string' && entityBlockById(s) !== null && !seen.has(s)) {
          seen.add(s)
          stack.push(s)
        }
      }
      cells.push(stack)
    }
    const id = typeof o.id === 'string' && ROW_ID_RE.test(o.id) ? o.id : `r${out.length}`
    const ratio = normalizeRatio(o.ratio, columns)
    const base = ratio ? { id, columns, cells, ratio } : { id, columns, cells }
    out.push(withRowMeta(base, o.title, o.headerOn, o.mt, o.mb))
  }
  return out.length ? out : null
}

/** Clamp a row to a kind's max columns (see MAX_COLUMNS_BY_KIND): keep the first `max` columns, drop any
 *  overflow column's boxes (they fall to the derived bench), and clear a now-inapplicable ratio. Total. */
function clampRowColumns(row: RowDef, max: RowColumns): RowDef {
  if (row.columns <= max) return row
  const cells = row.cells.slice(0, max)
  const columns = max
  const ratio = normalizeRatio(row.ratio, columns)
  // Carry the row title + header toggle through the clamp (they are independent of the column count).
  const base = ratio ? { ...row, columns, cells, ratio } : { id: row.id, columns, cells }
  return withRowMeta(base, row.title, row.headerOn, row.mt, row.mb)
}

/** Kind-aware re-validation of already-parsed rows (drop a retired / wrong-kind id, re-dedupe, and clamp
 *  each row to the kind's max columns so a member layout is single-column and a space at most two). Total. */
function sanitizeRows(rows: RowDef[] | undefined, kind: EntityKind): RowDef[] | undefined {
  if (!rows || !rows.length) return undefined
  const max = maxColumnsForKind(kind)
  const seen = new Set<string>()
  const out: RowDef[] = []
  for (const raw of rows.slice(0, MAX_ROWS)) {
    const row = clampRowColumns(raw, max)
    const cells: string[][] = []
    for (let i = 0; i < row.columns; i++) {
      const stack: string[] = []
      for (const s of (row.cells[i] ?? []).slice(0, MAX_STACK)) {
        if (typeof s === 'string' && !seen.has(s)) {
          const block = entityBlockById(s)
          if (block !== null && blockSupportsKind(block, kind)) {
            seen.add(s)
            stack.push(s)
          }
        }
      }
      cells.push(stack)
    }
    const id = ROW_ID_RE.test(row.id) ? row.id : `r${out.length}`
    const ratio = normalizeRatio(row.ratio, row.columns)
    const base = ratio ? { id, columns: row.columns, cells, ratio } : { id, columns: row.columns, cells }
    out.push(withRowMeta(base, row.title, row.headerOn, row.mt, row.mb))
  }
  return out.length ? out : undefined
}

/** Keep only the string entries of an unknown array; a non-array yields []. */
function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Fail-safe read of a saved grid layout node. Accepts the grid shape ({template,slots,hidden}) AND the
 * flat back-compat shape ({order}). Returns null for anything that is not a plain object, or an object
 * that carries none of the recognised keys — so a wrong shape reads as "no saved layout" and the fresh
 * default stands. Pure + total: an unusable value is dropped, never thrown.
 */
export function parseEntityLayout(raw: unknown): EntityLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as {
    rows?: unknown
    template?: unknown
    slots?: unknown
    hidden?: unknown
    order?: unknown
    content?: unknown
    style?: unknown
  }
  const out: EntityLayout = {}

  const rows = parseRows(o.rows)
  if (rows) out.rows = rows

  if (isTemplateId(o.template)) out.template = o.template

  if (o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots)) {
    const slots: Record<string, string[]> = {}
    for (const [slotId, ids] of Object.entries(o.slots as Record<string, unknown>)) {
      if (!isKnownSlotId(slotId)) continue
      const clean = strArr(ids)
      if (clean.length) slots[slotId] = clean
    }
    if (Object.keys(slots).length) out.slots = slots
  }

  const hidden = strArr(o.hidden)
  if (hidden.length) out.hidden = hidden

  const order = strArr(o.order)
  if (order.length) out.order = order

  const content = sanitizeContentMap(o.content)
  if (content) out.content = content

  const style = sanitizeStyleMap(o.style)
  if (style) out.style = style

  return Object.keys(out).length ? out : null
}

/**
 * Resolve the EFFECTIVE grid a surface renders, given the fresh-default ordered ids and the operator's
 * saved edits. Slot-aware mirror of S3's mergeProfileLayout. RULES:
 *   • only ids valid for the kind survive (drop a retired block, or one that does not support the kind);
 *   • `hidden` ids are dropped from every slot;
 *   • the template is the saved one (when valid), else the single-column default;
 *   • saved ids keep their slot when that slot exists in the template; an id in a slot the template no
 *     longer has falls into the default slot; a flat saved `order` reads as the default slot;
 *   • any default id the saved layout never placed (a new block, or one left untouched) is APPENDED to
 *     the default slot, so a newly added block shows up without re-opening the editor.
 * The returned slots contain ONLY visible, placed, valid ids. FAIL-SAFE: a null saved layout returns the
 * fresh default arranged in the single-column template's default slot.
 */
export function mergeEntityLayout(
  defaultIds: string[],
  saved: EntityLayout | null,
  kind: EntityKind,
): EntityLayout {
  // The universe of ids valid for this kind (drop retired / wrong-kind ids up front).
  const valid = defaultIds.filter((id) => {
    const block = entityBlockById(id)
    return block !== null && blockSupportsKind(block, kind)
  })
  const validSet = new Set(valid)

  const savedTemplate = saved?.template
  const template: TemplateId = isTemplateId(savedTemplate) ? savedTemplate : DEFAULT_TEMPLATE
  const templateSlots = slotIds(template)
  const def = defaultSlotId(template)
  const hidden = new Set((saved?.hidden ?? []).filter((id) => validSet.has(id)))

  // Seed the saved arrangement: prefer saved.slots; else a flat saved.order (→ default slot); else none.
  const savedSlots: Record<string, string[]> =
    saved?.slots ?? (saved?.order ? { [def]: saved.order } : {})

  const placed = new Set<string>()
  const out: Record<string, string[]> = {}
  const place = (slot: string, id: string) => {
    if (placed.has(id) || hidden.has(id) || !validSet.has(id)) return
    placed.add(id)
    ;(out[slot] ??= []).push(id)
  }

  // 1. Saved ids whose slot exists in this template, in template-slot order.
  for (const slot of templateSlots) for (const id of savedSlots[slot] ?? []) place(slot, id)
  // 2. Orphaned saved ids (a slot the template no longer has) fall into the default slot.
  for (const [slot, ids] of Object.entries(savedSlots)) {
    if (templateSlots.includes(slot)) continue
    for (const id of ids) place(def, id)
  }
  // 3. Append any remaining valid default id (new / untouched, not hidden) to the default slot.
  for (const id of valid) place(def, id)

  // Carry the per-block content + style through unchanged (ADR-528): they were validated on save and are
  // keyed by block id, independent of slot placement, so a renderer reads them off the effective grid.
  const merged: EntityLayout = { template, slots: out, hidden: [...hidden] }
  if (saved?.content) merged.content = saved.content
  if (saved?.style) merged.style = saved.style
  return merged
}

/**
 * Server-side WRITE guard: keep only ids valid for the kind (drop a retired / wrong-kind id), de-duped
 * across the whole layout so a block never lands in two slots. Mirrors the S3 action's sanitizeIds but
 * slot-aware. Returns null when nothing usable survives (the caller clears the saved node). Never trusts
 * the wire.
 */
export function sanitizeEntityLayout(raw: unknown, kind: EntityKind): EntityLayout | null {
  const parsed = parseEntityLayout(raw)
  if (!parsed) return null
  const seen = new Set<string>()
  const keep = (id: string): boolean => {
    if (seen.has(id)) return false
    const block = entityBlockById(id)
    if (block === null || !blockSupportsKind(block, kind)) return false
    seen.add(id)
    return true
  }
  const out: EntityLayout = {}
  const rows = sanitizeRows(parsed.rows, kind)
  if (rows) out.rows = rows
  if (isTemplateId(parsed.template)) out.template = parsed.template
  if (parsed.slots) {
    const slots: Record<string, string[]> = {}
    for (const [slot, ids] of Object.entries(parsed.slots)) {
      if (!isKnownSlotId(slot)) continue
      const clean = ids.filter(keep)
      if (clean.length) slots[slot] = clean
    }
    if (Object.keys(slots).length) out.slots = slots
  }
  // `order` shares the same de-dupe universe as slots (it is an alternate placement source).
  if (parsed.order) {
    const clean = parsed.order.filter(keep)
    if (clean.length) out.order = clean
  }
  if (parsed.hidden) {
    // Hidden ids are validated independently (they are not placements, so they do not consume `seen`).
    const clean = parsed.hidden.filter((id) => {
      const block = entityBlockById(id)
      return block !== null && blockSupportsKind(block, kind)
    })
    if (clean.length) out.hidden = [...new Set(clean)]
  }
  // Content + style were already validated by parseEntityLayout (block-id allowlist + per-field / enum
  // sanitize). Iterate the ALLOWLIST of blocks valid for this kind (blocksForKind), NOT the raw user
  // keys, so every written property name is a fixed registry id — a user-originated key is only ever
  // READ, never used as a write property name (CodeQL js/remote-property-injection; mirrors the
  // sanitizeContentMap / KNOWN_SLOT_IDS pattern). A wrong-kind block is absent from the list, so its bag
  // drops for free.
  if (parsed.content) {
    const src = parsed.content
    const content: Record<string, Record<string, unknown>> = {}
    for (const block of blocksForKind(kind)) {
      if (Object.hasOwn(src, block.id)) content[block.id] = src[block.id]
    }
    if (Object.keys(content).length) out.content = content
  }
  if (parsed.style) {
    const src = parsed.style
    const style: Record<string, BlockStyle> = {}
    for (const block of blocksForKind(kind)) {
      if (Object.hasOwn(src, block.id)) style[block.id] = src[block.id]
    }
    if (Object.keys(style).length) out.style = style
  }
  return Object.keys(out).length ? out : null
}

/** The visible block ids of a resolved layout, per slot, in the template's slot order. A convenience for
 *  a renderer: pass the OUTPUT of mergeEntityLayout (or a hand-built EntityLayout with a template). */
export function layoutSlots(layout: EntityLayout): Array<{ slot: string; ids: string[] }> {
  const template = isTemplateId(layout.template) ? layout.template : DEFAULT_TEMPLATE
  const def = defaultSlotId(template)
  const slots = layout.slots ?? (layout.order ? { [def]: layout.order } : {})
  return slotIds(template).map((slot) => ({ slot, ids: slots[slot] ?? [] }))
}

// ── template → rows bridge (ADR-516 Phase A) ─────────────────────────────────────────────────────────
// Converts a LEGACY layout (a fixed template + its per-slot block lists) into the freeform RowDef[] so a
// reader / renderer can be rows-native even for an un-migrated profile. Each template maps to a
// DETERMINISTIC rows geometry that mirrors the current components/entity-blocks/entity-grid.tsx switch:
//   • a FULL-WIDTH slot (single's main, and every header/top/footer) → one 1-column row PER block, so the
//     blocks stack exactly as the single-column render does today (the dominant default case, kept
//     byte-identical: N 1-col rows render as N stacked blocks inside one `@container space-y-6`);
//   • a COLUMN GROUP (main+side, or the equal col-1..col-N) → N-column rows, zipped row-by-row down the
//     columns. The rows model uses EQUAL columns, so the legacy 3:2 main/side ratio renders 1:1; the
//     block grouping + order are preserved. Freeform rows are an equal-column paradigm by construction.

function rowsBuilder() {
  const rows: RowDef[] = []
  let n = 0
  return {
    rows,
    /** One 1-column row per id (full-width stack). */
    full(ids: string[]) {
      for (const id of ids) rows.push({ id: `r${n++}`, columns: 1, cells: [[id]] })
    },
    /** N-column rows, zipping the given per-column id lists down the rows (each cell a single-box stack).
     *  Skips an all-empty row. */
    group(columns: RowColumns, lists: string[][]) {
      const max = lists.reduce((m, l) => Math.max(m, l.length), 0)
      for (let i = 0; i < max; i++) {
        const picked: (string | null)[] = lists.slice(0, columns).map((l) => l[i] ?? null)
        while (picked.length < columns) picked.push(null)
        if (picked.every((s) => s === null)) continue
        rows.push({ id: `r${n++}`, columns, cells: picked.map((s) => (s ? [s] : [])) })
      }
    },
  }
}

/**
 * Convert a legacy template + slots map into the freeform rows model, kind-filtered (a retired /
 * wrong-kind id is dropped). Deterministic; mirrors the entity-grid geometry (see block above). Pure.
 */
export function templateToRows(
  template: TemplateId | undefined,
  slots: Record<string, string[]> | undefined,
  kind: EntityKind,
): RowDef[] {
  const tpl: TemplateId = isTemplateId(template) ? template : DEFAULT_TEMPLATE
  const get = (slot: string): string[] =>
    (slots?.[slot] ?? []).filter((id) => {
      const block = entityBlockById(id)
      return block !== null && blockSupportsKind(block, kind)
    })
  const b = rowsBuilder()
  switch (tpl) {
    case 'single':
      b.full(get('main'))
      break
    case 'main-side':
      b.group(2, [get('main'), get('side')])
      break
    case 'two-col':
      b.full(get('top'))
      b.group(2, [get('col-1'), get('col-2')])
      break
    case 'three-col':
      b.full(get('top'))
      b.group(3, [get('col-1'), get('col-2'), get('col-3')])
      break
    case 'header-side':
      b.full(get('header'))
      b.group(2, [get('main'), get('side')])
      break
    case 'header-two-col':
      b.full(get('header'))
      b.group(2, [get('col-1'), get('col-2')])
      break
    case 'header-main-side-footer':
      b.full(get('header'))
      b.group(2, [get('main'), get('side')])
      b.full(get('footer'))
      break
  }
  return b.rows
}

// ── starter layouts (the "auto-populate" seeds, ADR-516 Phase A) ─────────────────────────────────────
// Three seeds a fresh page can start from, per kind. `basic` = the current default expressed as rows, so
// "everyone starts with basic" is a no-op visual change (member basic renders identically to the legacy
// single-column default). All ids are real registry blocks for the kind. Data only (no member-visible
// prose), so nothing here needs the voice canon beyond the block labels the registry already owns.

/** The three starter seeds. */
export type StarterId = 'basic' | 'showcase' | 'minimal'

/** A starter row: `cells` are the per-column single-box stacks (a null column is empty). */
const r = (id: string, columns: RowColumns, slots: (string | null)[]): RowDef => ({
  id,
  columns,
  cells: slots.map((s) => (s ? [s] : [])),
})

const MEMBER_STARTERS: Record<StarterId, readonly RowDef[]> = {
  // The in-app member default (ADR-522): `about` + `stats` are NOT here — the profile chrome already
  // renders the bio (identity band) and the Zaps/Gems/Streak/Rank (Standing card), so the member grid
  // leads with the blocks the chrome does NOT own: links, then Top Friends. The MEMBER profile is a
  // single-column block LIST (maxColumnsForKind('member') === 1), so every starter row is one column.
  basic: [r('r0', 1, ['links']), r('r1', 1, ['topfriends'])],
  // Links, then Top Friends (stacked — member is single-column).
  showcase: [r('r0', 1, ['links']), r('r1', 1, ['topfriends'])],
  // Just the bio-link row.
  minimal: [r('r0', 1, ['links'])],
}

const SPACE_STARTERS: Record<StarterId, readonly RowDef[]> = {
  // The core best-practice space profile (ADR-529): identity story, what you offer + how to book, what's
  // coming up + who runs it, social proof, then how to reach you.
  basic: [
    r('r0', 1, ['about']),
    r('r1', 1, ['offerings']),
    r('r2', 1, ['booking']),
    r('r3', 1, ['events']),
    r('r4', 1, ['team']),
    r('r5', 1, ['reviews']),
    r('r6', 1, ['contact']),
  ],
  showcase: [
    r('r0', 1, ['about']),
    r('r1', 2, ['offerings', 'booking']),
    r('r2', 2, ['events', 'team']),
    r('r3', 1, ['reviews']),
    r('r4', 1, ['contact']),
  ],
  minimal: [r('r0', 1, ['about']), r('r1', 1, ['offerings']), r('r2', 1, ['contact'])],
}

// A fresh EMAIL starts as a single vertical column of authored blocks (single-column by construction). The
// starter seeds a friendly skeleton the operator fills in: a Banner headline, a paragraph, and a Button
// (`showcase`), a leaner heading + text + button (`basic`), or just a heading + text (`minimal`). All ids are
// real email-palette blocks; their authored content is supplied by the editor (blank blocks render nothing).
const EMAIL_STARTERS: Record<StarterId, readonly RowDef[]> = {
  basic: [r('r0', 1, ['heading']), r('r1', 1, ['text']), r('r2', 1, ['button'])],
  showcase: [r('r0', 1, ['photoHero']), r('r1', 1, ['text']), r('r2', 1, ['button'])],
  minimal: [r('r0', 1, ['heading']), r('r1', 1, ['text'])],
}

/** The starter seeds by kind. Values are read-only templates; use starterRows to get a fresh, mutable copy. */
export const STARTER_LAYOUTS: Record<EntityKind, Record<StarterId, readonly RowDef[]>> = {
  member: MEMBER_STARTERS,
  space: SPACE_STARTERS,
  email: EMAIL_STARTERS,
}

/** A fresh, deep-copied RowDef[] for a starter seed (safe to hand to a mutable editor / renderer). */
export function starterRows(kind: EntityKind, id: StarterId): RowDef[] {
  return STARTER_LAYOUTS[kind][id].map((row) => ({ ...row, cells: row.cells.map((c) => [...c]) }))
}

/**
 * Resolve the EFFECTIVE rows a surface renders (ADR-516 Phase A). The single read entry the renderer uses:
 *   • `layout.rows` present → validate it (drop hidden / retired / wrong-kind ids, re-dedupe) and use it;
 *   • else a legacy `template` + `slots` (or a flat `order`) → templateToRows over the effective slots;
 *   • else (no usable layout) → the `basic` starter for the kind.
 * A brand-new registry block is NEVER auto-placed onto a rows layout (it falls to the derived inactive
 * tray), so the page never changes shape unexpectedly. FAIL-SAFE + total. Pass the OUTPUT of
 * mergeEntityLayout (already kind-filtered / hidden-dropped / append-resolved) for the legacy path to get
 * the exact current effective render for existing data.
 */
export function resolveRows(layout: EntityLayout | null, kind: EntityKind): RowDef[] {
  const max = maxColumnsForKind(kind)
  if (layout?.rows && layout.rows.length) {
    const hidden = new Set(layout.hidden ?? [])
    const seen = new Set<string>()
    const out: RowDef[] = []
    for (const raw of layout.rows.slice(0, MAX_ROWS)) {
      const row = clampRowColumns(raw, max)
      const cells: string[][] = []
      for (let i = 0; i < row.columns; i++) {
        const stack: string[] = []
        for (const s of (row.cells[i] ?? []).slice(0, MAX_STACK)) {
          if (typeof s === 'string' && !hidden.has(s) && !seen.has(s)) {
            const block = entityBlockById(s)
            if (block !== null && blockSupportsKind(block, kind)) {
              seen.add(s)
              stack.push(s)
            }
          }
        }
        cells.push(stack)
      }
      const id = ROW_ID_RE.test(row.id) ? row.id : `r${out.length}`
      const ratio = normalizeRatio(row.ratio, row.columns)
      const base = ratio ? { id, columns: row.columns, cells, ratio } : { id, columns: row.columns, cells }
      // Carry the row title + live-header toggle into the rendered rows so EntityGrid can draw the header.
      out.push(withRowMeta(base, row.title, row.headerOn, row.mt, row.mb))
    }
    return out
  }
  if (layout && (layout.template || layout.slots || layout.order)) {
    const tpl = isTemplateId(layout.template) ? layout.template : DEFAULT_TEMPLATE
    const def = defaultSlotId(tpl)
    const slots = layout.slots ?? (layout.order ? { [def]: layout.order } : {})
    // The legacy template geometry can emit 3/4-column rows; clamp them to the kind max so an old space
    // layout renders within the two-column model (overflow blocks drop to nothing, matching sanitize).
    return templateToRows(tpl, slots, kind).map((row) => clampRowColumns(row, max))
  }
  return starterRows(kind, 'basic')
}
