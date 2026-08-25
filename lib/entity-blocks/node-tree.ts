// THE NODE TREE — E0 task 8 (docs/EDITOR-E0.md §1). The identity a block placement has never had.
//
// ── THE ANSWER, FIRST ─────────────────────────────────────────────────────────────────────────
//
// Today a placement IS its block id: `RowDef.cells` is `string[][]`, and the authored `content` /
// `style` bags hang off the document keyed by that same id. That is why six independent dedupe
// sets exist (`docs/EDITOR-E0.md` §1.1) and why two Text blocks are illegal — two placements of
// one type would share one content bag.
//
// A `BlockNode` gives the placement its own id (`nid`) and carries its content with it, so the
// sibling maps stop being load-bearing and duplicates become expressible. Nothing in the app reads
// this module yet: E0 task 9 calls `upgradeLayout` at the top of `parseEntityLayout`, and that is a
// separate, separately-provable increment (backlog LIVE-119).
//
// ── 🔴 THE MEASUREMENT THAT CHANGED THE DESIGN, 2026-08-25 (ADR-1129) ─────────────────────────
//
// `docs/EDITOR-E0.md` §1.2 says: "`EntityLayout.content` and `.style` are DELETED, not re-keyed."
// Read literally — fold each bag into the node that names it, drop the map — that loses author
// work, because THE SIBLING MAP IS THE BENCH'S ONLY STORAGE. `rows-ops.ts:13-15` states the
// mechanic outright: "benching a block removes it from its column so it falls back to the derived
// bench tray WITH ITS CONFIG INTACT". Intact where? In `content[id]`, which no cell references.
//
// Measured against production on 2026-08-25: **34 authored content bags and 1 style bag belong to
// blocks that are benched, not placed — spread across 18 of 18 Space layout documents.** `about`
// in 17 of them, `story` in 16, `cardGrid` in 1. None is in `hidden`, so none survives as a hidden
// placement either. A fold that only visits `cells` deletes every one.
//
// So the fold is a PARTITION, not a projection: every key of `content` / `style` / `hidden` is
// either matched to a placed node or becomes a BENCH node. `benchLoss()` below exists so a caller
// can assert that partition held, and `scripts/check-entity-layouts.mjs` asserts the benched types
// still resolve — the arm no gate in this repo had, and the one that would have caught this.
//
// ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────
//
// · **No `v:` on a node.** `docs/EDITOR-E0.md` §1.2 sketches one. Block versions arrive with E1's
//   `defineBlock`; minting `v: 1` on 226 nodes today would be a constant nobody can verify and a
//   migration nobody can run — shape, not truth. The slot is added when there is a version to put
//   in it.
// · **No per-type limits.** That is task 10, and it needs `deriveBench` split first. This function
//   is an UPGRADE: it re-expresses what is stored, it does not re-decide what is legal.
// · **No dropping of unknown types.** `parseRows` drops a placement whose id left the registry.
//   ADR-978 settled that a loader must never discard an author's document over an unknown type, so
//   the upgrade PRESERVES it and leaves legality to `sanitizeRows` / `resolveRows`, which run after
//   and are unchanged. Keep this property at task 9.

import type { BlockStyle, MarginStep } from './block-content'
import type { RowColumns, RowRatio } from './layout'

/** A generated, stable node id. Minted here, never a user-supplied string, and never used as an
 *  object write key — `cells` is an array of objects precisely so there is no property-injection
 *  surface to guard (`layout.ts:443-447`, CodeQL `js/remote-property-injection`). */
export const NODE_ID_RE = /^n[0-9a-z]{6,12}$/i

/** ONE placement of one block type. `nid` is stable for the life of the placement: E0 task 17 uses
 *  it as `app_instances.id`, so a re-minted id is a lost row, not a cosmetic change. */
export interface BlockNode {
  nid: string
  /** The registry block id — what `cells: string[][]` used to hold. */
  type: string
  /** The authored content bag, moved off `EntityLayout.content[type]`. */
  content?: Record<string, unknown>
  /** The authored style bag, moved off `EntityLayout.style[type]`. */
  style?: BlockStyle
  /** Replaces the document-level `hidden: string[]`, which could only hide every node of a type. */
  hidden?: boolean
}

/** `RowDef` with node cells. Every other field is `RowDef`'s, unchanged. */
export interface NodeRowDef {
  id: string
  columns: RowColumns
  cells: BlockNode[][]
  ratio?: RowRatio
  title?: string
  headerOn?: boolean
  mt?: MarginStep
  mb?: MarginStep
}

/** The upgraded document. `content` / `style` / `hidden` are gone: every bag lives on the node that
 *  owns it, and a bag with no placement lives on a `bench` node (see the header). */
export interface NodeLayout {
  rows: NodeRowDef[]
  /** Authored-but-unplaced nodes. Stored, not derived — that is what `docs/EDITOR-E0.md` §1.3 means
   *  by "benching moves the node out of `cells` with its content intact". */
  bench: BlockNode[]
  /** Carried through untouched; the template id is not a placement. */
  template?: string
}

// Bounds. Same numbers `layout.ts` / `rows-ops.ts` already enforce, so an upgraded document cannot
// be larger than a parsed one. MAX_BENCH is new: the bench was derived, so it never needed a cap.
const MAX_ROWS = 24
const MAX_STACK = 12
const MAX_BENCH = 48
const VALID_COLUMNS: ReadonlySet<number> = new Set([1, 2, 3, 4])
const ROW_ID_RE = /^r[0-9a-z]+$/i

/** FNV-1a, 32-bit, `Math.imul` for the wrap. Not a cryptographic hash and does not need to be: the
 *  requirement is DETERMINISM (re-running the upgrade must mint the same ids, or step 9's
 *  "upgrade on every read" would churn `layout-equal` forever), not unpredictability. */
function fnv1a(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * A deterministic node id for `seed`, avoiding anything in `taken`.
 *
 * Two 32-bit hashes with different offset bases are concatenated in base36 and padded, so the id is
 * always exactly `n` + 10 chars and always matches NODE_ID_RE. On a collision the seed is salted and
 * re-hashed — deterministic, so two runs over one document agree, and bounded, so it is total.
 */
export function nodeIdFor(seed: string, taken?: ReadonlySet<string>): string {
  for (let salt = 0; salt < 64; salt++) {
    const s = salt === 0 ? seed : `${seed}#${salt}`
    const a = fnv1a(s, 0x811c9dc5).toString(36).padStart(7, '0')
    const b = fnv1a(s, 0x9e3779b1).toString(36).padStart(7, '0')
    const id = `n${(a + b).slice(0, 10)}`
    if (!taken || !taken.has(id)) return id
  }
  // 64 collisions on one seed is not reachable with two independent 32-bit hashes; returning the
  // last candidate keeps the function total rather than throwing inside a read path.
  return `n${(fnv1a(seed, 0x811c9dc5).toString(36).padStart(7, '0') + '0000000').slice(0, 10)}`
}

/** The seed for a PLACED node: position plus type. Position, not order of discovery, so the ids of a
 *  document that is upgraded twice agree even though nothing about the run is shared. */
export function placedSeed(rowId: string, col: number, index: number, type: string): string {
  return `${rowId}:${col}:${index}:${type}`
}

/** The seed for a BENCH node. There is no position, so the type alone identifies it — which is
 *  exactly the old model's assumption, and it is sound here because a bench holds one node per type
 *  by construction (its members come from the `content` / `style` maps, whose keys are types). */
export function benchSeed(type: string): string {
  return `bench:${type}`
}

function isRowColumns(v: unknown): v is RowColumns {
  return typeof v === 'number' && VALID_COLUMNS.has(v)
}

function plainObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Read one cell entry, which is a bare type string on a stored document and a `BlockNode` on an
 *  already-upgraded one. Returns the type plus any node fields already present — this is the whole
 *  of idempotence: a node that arrives with a valid `nid` keeps it. */
function readCell(raw: unknown): { type: string; node: Partial<BlockNode> } | null {
  if (typeof raw === 'string') return raw ? { type: raw, node: {} } : null
  const o = plainObject(raw)
  if (!o || typeof o.type !== 'string' || !o.type) return null
  const node: Partial<BlockNode> = {}
  if (typeof o.nid === 'string' && NODE_ID_RE.test(o.nid)) node.nid = o.nid
  const content = plainObject(o.content)
  if (content) node.content = content
  const style = plainObject(o.style)
  if (style) node.style = style as BlockStyle
  if (o.hidden === true) node.hidden = true
  return { type: o.type, node }
}

/** The per-column stacks of a stored row, accepting `cells` (current), `slots` (legacy, one entry per
 *  column) and neither. Mirrors `layout.ts:rawCells` so the two readers cannot disagree. */
function rawCells(o: Record<string, unknown>): unknown[][] {
  if (Array.isArray(o.cells)) return o.cells.map((c) => (Array.isArray(c) ? c : []))
  if (Array.isArray(o.slots)) return o.slots.map((s) => (s === null || s === undefined ? [] : [s]))
  return []
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Upgrade a stored entity layout to the node tree. **Pure, total, idempotent, deterministic.**
 *
 * - PURE — no clock, no randomness, no I/O; every id is a hash of the placement's own coordinates.
 * - TOTAL — anything unusable is dropped, never thrown. A non-object reads as `null`, which is what
 *   `parseEntityLayout` already means by "no saved layout".
 * - IDEMPOTENT — `upgradeLayout(upgradeLayout(x)) === upgradeLayout(x)`, structurally. An input that
 *   already carries nodes passes its `nid`s straight through.
 * - DETERMINISTIC — two runs, two processes, two machines mint the same ids for the same document.
 *
 * Legacy `slots` / `order` shapes are read as one single-column row, so a document that never made
 * it to the `rows` shape is upgraded rather than discarded (production has 0 of these, but the
 * fixture corpus carries synthetic ones, and "0 today" is not "0 in a preview branch").
 */
export function upgradeLayout(raw: unknown): NodeLayout | null {
  const doc = plainObject(raw)
  if (!doc) return null

  const contentMap = plainObject(doc.content) ?? {}
  const styleMap = plainObject(doc.style) ?? {}
  const hidden = new Set(strArr(doc.hidden))

  const taken = new Set<string>()
  // Types already handed their bag. A duplicate placement of one type cannot also claim it — the
  // sibling map only ever held one bag, so the FIRST placement wins and the second starts empty.
  // Production has no duplicates (measured: max 1 per type per document); synthetic ones must not
  // silently clone an author's content into two blocks.
  const claimed = new Set<string>()
  const placedTypes = new Set<string>()

  const mint = (seed: string, existing: string | undefined): string => {
    const id = existing && !taken.has(existing) ? existing : nodeIdFor(seed, taken)
    taken.add(id)
    return id
  }

  const build = (type: string, partial: Partial<BlockNode>, seed: string): BlockNode => {
    const node: BlockNode = { nid: mint(seed, partial.nid), type }
    const content = partial.content ?? (claimed.has(type) ? undefined : contentMap[type])
    const style = partial.style ?? (claimed.has(type) ? undefined : styleMap[type])
    claimed.add(type)
    const contentObj = plainObject(content)
    if (contentObj && Object.keys(contentObj).length) node.content = contentObj
    const styleObj = plainObject(style)
    if (styleObj && Object.keys(styleObj).length) node.style = styleObj as BlockStyle
    if (partial.hidden === true || hidden.has(type)) node.hidden = true
    return node
  }

  const rows: NodeRowDef[] = []
  const rawRows = Array.isArray(doc.rows) ? doc.rows : legacyRows(doc)
  for (const r of rawRows.slice(0, MAX_ROWS)) {
    const o = plainObject(r)
    if (!o || !isRowColumns(o.columns)) continue
    const columns = o.columns
    const id = typeof o.id === 'string' && ROW_ID_RE.test(o.id) ? o.id : `r${rows.length}`
    const raws = rawCells(o)
    const cells: BlockNode[][] = []
    for (let col = 0; col < columns; col++) {
      const stack: BlockNode[] = []
      const source = Array.isArray(raws[col]) ? raws[col].slice(0, MAX_STACK) : []
      for (const entry of source) {
        const read = readCell(entry)
        if (!read) continue
        stack.push(build(read.type, read.node, placedSeed(id, col, stack.length, read.type)))
        placedTypes.add(read.type)
      }
      cells.push(stack)
    }
    const row: NodeRowDef = { id, columns, cells }
    if (columns === 2 && (o.ratio === 'lead' || o.ratio === 'trail')) row.ratio = o.ratio
    if (typeof o.title === 'string' && o.title.trim()) row.title = o.title
    if (o.headerOn === true) row.headerOn = true
    if (typeof o.mt === 'string') row.mt = o.mt as MarginStep
    if (typeof o.mb === 'string') row.mb = o.mb as MarginStep
    rows.push(row)
  }

  // ── THE PARTITION. Every key of content / style / hidden that no placement claimed becomes a
  // bench node, so the sibling maps can be dropped without losing a bag. See the header.
  const bench: BlockNode[] = []
  for (const entry of Array.isArray(doc.bench) ? doc.bench : []) {
    const read = readCell(entry)
    if (!read || placedTypes.has(read.type) || bench.length >= MAX_BENCH) continue
    bench.push(build(read.type, read.node, benchSeed(read.type)))
    placedTypes.add(read.type)
  }
  const orphans = [...new Set([...Object.keys(contentMap), ...Object.keys(styleMap), ...hidden])].sort()
  for (const type of orphans) {
    if (placedTypes.has(type) || bench.length >= MAX_BENCH) continue
    bench.push(build(type, {}, benchSeed(type)))
    placedTypes.add(type)
  }

  const out: NodeLayout = { rows, bench }
  if (typeof doc.template === 'string') out.template = doc.template
  return out
}

/** The legacy pre-`rows` shapes, read as one single-column row so nothing is discarded: `order` (a
 *  flat id list) and `slots` (slot key → ordered ids, whose KEYS are not types and are ignored). */
function legacyRows(doc: Record<string, unknown>): unknown[] {
  const flat: string[] = []
  for (const id of strArr(doc.order)) flat.push(id)
  const slots = plainObject(doc.slots)
  if (slots) for (const value of Object.values(slots)) for (const id of strArr(value)) flat.push(id)
  return flat.length ? [{ id: 'r0', columns: 1, cells: [flat] }] : []
}

/** Every node in a layout, placed then benched. */
export function allNodes(layout: NodeLayout): BlockNode[] {
  const out: BlockNode[] = []
  for (const row of layout.rows) for (const stack of row.cells) for (const node of stack) out.push(node)
  for (const node of layout.bench) out.push(node)
  return out
}

/**
 * The bags a stored document holds that the upgraded tree does NOT — which must always be empty.
 *
 * This is the assertion the 2026-08-25 measurement earned: it is cheap, it is exact, and it is the
 * difference between "the fold looked right" and "the fold lost nothing". Returns `content` / `style`
 * keys present in `raw` with no node of that type in `upgraded`.
 */
export function benchLoss(raw: unknown, upgraded: NodeLayout | null): string[] {
  const doc = plainObject(raw)
  if (!doc) return []
  const kept = new Set(upgraded ? allNodes(upgraded).map((n) => n.type) : [])
  const contentMap = plainObject(doc.content) ?? {}
  const styleMap = plainObject(doc.style) ?? {}
  // An EMPTY bag is not author work — `divider: {}` occurs on 8 live email documents and carries
  // nothing. Dropping it is correct; counting it as loss would make this assertion cry wolf.
  const nonEmpty = (map: Record<string, unknown>) =>
    Object.keys(map).filter((k) => Object.keys(plainObject(map[k]) ?? {}).length > 0)
  const keys = new Set([...nonEmpty(contentMap), ...nonEmpty(styleMap), ...strArr(doc.hidden)])
  return [...keys].filter((k) => !kept.has(k)).sort()
}
