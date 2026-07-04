import { entityBlockById, blockSupportsKind, type EntityKind } from './registry'
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

/** A row's column count. Equal columns; the renderer stacks them on mobile and lays them N-up at lg. */
export type RowColumns = 1 | 2 | 3 | 4

/** One row of the freeform layout: `columns` equal cells, each a block id or null (empty). Invariant:
 *  `slots.length === columns`. `id` is a safe generated token (see ROW_ID_RE), never used as an object key. */
export interface RowDef {
  id: string
  columns: RowColumns
  slots: (string | null)[]
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
}

// Rows-shape validation bounds. A layout is user-originated, so every bound is enforced on parse.
const MAX_ROWS = 24
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
/** A safe generated row id (never a raw user key). Anything else is regenerated positionally. */
const ROW_ID_RE = /^r[0-9a-z]+$/i

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
}

/**
 * Fail-safe read of a saved `rows` array. Validates the SHAPE (positional, so no slot-key allowlist):
 * clamps to MAX_ROWS; drops a row whose `columns` is not in {1,2,3,4}; clamps each row's `slots` to its
 * `columns`; keeps a cell only when it is a KNOWN registry block id (kind-agnostic here — kind filtering
 * is applied in sanitize/resolve, mirroring how the legacy slots path defers kind to those stages),
 * else null; dedupes a block id across ALL rows (a later repeat becomes null); and regenerates any id
 * that is not a safe token. Returns null when nothing usable survives.
 */
function parseRows(raw: unknown): RowDef[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: RowDef[] = []
  for (const r of raw.slice(0, MAX_ROWS)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const o = r as { id?: unknown; columns?: unknown; slots?: unknown }
    if (!isRowColumns(o.columns)) continue
    const columns = o.columns
    const rawSlots = Array.isArray(o.slots) ? o.slots : []
    const slots: (string | null)[] = []
    for (let i = 0; i < columns; i++) {
      const s = rawSlots[i]
      if (typeof s === 'string' && entityBlockById(s) !== null && !seen.has(s)) {
        seen.add(s)
        slots.push(s)
      } else {
        slots.push(null)
      }
    }
    const id = typeof o.id === 'string' && ROW_ID_RE.test(o.id) ? o.id : `r${out.length}`
    out.push({ id, columns, slots })
  }
  return out.length ? out : null
}

/** Kind-aware re-validation of already-parsed rows (drop a retired / wrong-kind id, re-dedupe). Total. */
function sanitizeRows(rows: RowDef[] | undefined, kind: EntityKind): RowDef[] | undefined {
  if (!rows || !rows.length) return undefined
  const seen = new Set<string>()
  const out: RowDef[] = []
  for (const row of rows.slice(0, MAX_ROWS)) {
    const slots: (string | null)[] = []
    for (let i = 0; i < row.columns; i++) {
      const s = row.slots[i] ?? null
      if (s !== null && !seen.has(s)) {
        const block = entityBlockById(s)
        if (block !== null && blockSupportsKind(block, kind)) {
          seen.add(s)
          slots.push(s)
          continue
        }
      }
      slots.push(null)
    }
    const id = ROW_ID_RE.test(row.id) ? row.id : `r${out.length}`
    out.push({ id, columns: row.columns, slots })
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
  const o = raw as { rows?: unknown; template?: unknown; slots?: unknown; hidden?: unknown; order?: unknown }
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

  return { template, slots: out, hidden: [...hidden] }
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
      for (const id of ids) rows.push({ id: `r${n++}`, columns: 1, slots: [id] })
    },
    /** N-column rows, zipping the given per-column id lists down the rows. Skips an all-empty row. */
    group(columns: RowColumns, lists: string[][]) {
      const max = lists.reduce((m, l) => Math.max(m, l.length), 0)
      for (let i = 0; i < max; i++) {
        const slots: (string | null)[] = lists.slice(0, columns).map((l) => l[i] ?? null)
        while (slots.length < columns) slots.push(null)
        if (slots.every((s) => s === null)) continue
        rows.push({ id: `r${n++}`, columns, slots })
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

const r = (id: string, columns: RowColumns, slots: (string | null)[]): RowDef => ({ id, columns, slots })

const MEMBER_STARTERS: Record<StarterId, readonly RowDef[]> = {
  // The in-app member default (ADR-522): `about` + `stats` are NOT here — the profile chrome already
  // renders the bio (identity band) and the Zaps/Gems/Streak/Rank (Standing card), so the member grid
  // leads with the blocks the chrome does NOT own: links, then Top Friends.
  basic: [r('r0', 1, ['links']), r('r1', 1, ['topfriends'])],
  // Links + Top Friends 2-up.
  showcase: [r('r0', 2, ['links', 'topfriends'])],
  // Just the bio-link row.
  minimal: [r('r0', 1, ['links'])],
}

const SPACE_STARTERS: Record<StarterId, readonly RowDef[]> = {
  basic: [
    r('r0', 1, ['about']),
    r('r1', 1, ['stats']),
    r('r2', 1, ['offerings']),
    r('r3', 1, ['events']),
    r('r4', 1, ['updates']),
  ],
  showcase: [r('r0', 1, ['about']), r('r1', 2, ['offerings', 'events']), r('r2', 2, ['stats', 'reviews'])],
  minimal: [r('r0', 1, ['about'])],
}

/** The starter seeds by kind. Values are read-only templates; use starterRows to get a fresh, mutable copy. */
export const STARTER_LAYOUTS: Record<EntityKind, Record<StarterId, readonly RowDef[]>> = {
  member: MEMBER_STARTERS,
  space: SPACE_STARTERS,
}

/** A fresh, deep-copied RowDef[] for a starter seed (safe to hand to a mutable editor / renderer). */
export function starterRows(kind: EntityKind, id: StarterId): RowDef[] {
  return STARTER_LAYOUTS[kind][id].map((row) => ({ ...row, slots: [...row.slots] }))
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
  if (layout?.rows && layout.rows.length) {
    const hidden = new Set(layout.hidden ?? [])
    const seen = new Set<string>()
    const out: RowDef[] = []
    for (const row of layout.rows.slice(0, MAX_ROWS)) {
      const slots: (string | null)[] = []
      for (let i = 0; i < row.columns; i++) {
        const s = row.slots[i] ?? null
        if (s !== null && !hidden.has(s) && !seen.has(s)) {
          const block = entityBlockById(s)
          if (block !== null && blockSupportsKind(block, kind)) {
            seen.add(s)
            slots.push(s)
            continue
          }
        }
        slots.push(null)
      }
      out.push({ id: ROW_ID_RE.test(row.id) ? row.id : `r${out.length}`, columns: row.columns, slots })
    }
    return out
  }
  if (layout && (layout.template || layout.slots || layout.order)) {
    const tpl = isTemplateId(layout.template) ? layout.template : DEFAULT_TEMPLATE
    const def = defaultSlotId(tpl)
    const slots = layout.slots ?? (layout.order ? { [def]: layout.order } : {})
    return templateToRows(tpl, slots, kind)
  }
  return starterRows(kind, 'basic')
}
