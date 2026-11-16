// THE CANVAS'S REAL DOCUMENT (PROG-E5B). The staff canvas edits a Space page's node document, and this is the
// whole model of that, with no React and no I/O.
//
// WHERE THE DRAFT LIVES. A Space page's node document already has a draft store: `spaces.preferences
// .profileLayoutDraft`, beside the published `profileLayout` (the split the Space page builder autosaves into and
// publishes from). The canvas reads `draft ?? published`, exactly as that builder does, and writes the draft only.
// No new table and no new column.
//
// THE BASE A SAVE BUILDS ON. Two parts, both checked before a write:
//   - `revision`: a counter kept beside the draft at `preferences.profileLayoutDraftRevision`. The store compares
//     it and writes in ONE update (writeSpacePreferencesAtRevision), so of two canvas tabs on one revision exactly
//     one lands. This mirrors planDraftSnapshot (lib/editor-crdt/draft-revision.ts): ready, conflict or invalid,
//     and the next revision is the base plus one.
//   - `fingerprint`: a hash of the document the tab loaded. The Space page builder saves the same draft and
//     does not move the counter, so the counter alone would let a stale canvas tab overwrite a builder save.
//     The fingerprint is compared against a fresh read in the same action. That part is read then write, not
//     one statement; closing it fully needs a SQL function (no migration in this slice).

import type { InspectorFieldView } from './inspector-fields'
import type { InspectorDeviceValues } from './inspector-model'
import type { CanvasInserterView } from './canvas-presets'
import { withSpacing, type LayerSlot, type LayerTree, type SpacingEdge, type SpacingStep } from './canvas-tree'
import { upgradeLayout, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'
import { addNode, findNode, getNode, placeNode, sanitizeNodeLayout, setNodeContent, setNodeResponsive, setNodeStyle } from '@/lib/entity-blocks/node-ops'

/** The preferences keys this document lives under. The draft and published keys are the Space page builder's. */
export const CANVAS_DRAFT_KEY = 'profileLayoutDraft'
const CANVAS_PUBLISHED_KEY = 'profileLayout'
export const CANVAS_REVISION_KEY = 'profileLayoutDraftRevision'

export interface CanvasDraftBase {
  revision: number
  fingerprint: string
}

interface CanvasDocument {
  /** The stored document as nodes, or null when the Space has none (the canvas then keeps its demo block). */
  layout: NodeLayout | null
  /** Which stored node was read: the draft when one exists, else what is published. */
  source: 'draft' | 'published' | 'none'
  base: CanvasDraftBase
}

/** One placed node as the canvas draws it: the controls the server derived from its block contract, and its
 *  stored desktop content and device overrides. */
export interface CanvasNodeView {
  nid: string
  title: string
  fields: InspectorFieldView[]
  elsewhere: number
  node: Pick<BlockNode, 'nid' | 'type' | 'content' | 'responsive' | 'style'>
}

/** A stored node as it crosses to the canvas: its id, type and the bags it holds, and nothing it does not. */
export function canvasStoredNode({ nid, type, content, responsive, style }: BlockNode): CanvasNodeView['node'] {
  return { nid, type, ...(content ? { content } : {}), ...(responsive ? { responsive } : {}), ...(style ? { style } : {}) }
}

/** What the route hands the canvas for a real document. */
export interface CanvasDocumentView {
  spaceId: string
  spaceName: string
  source: 'draft' | 'published'
  /** False when this viewer may look but not save; `notice` says why in a sentence. */
  canSave: boolean
  notice: string | null
  base: CanvasDraftBase
  nodes: CanvasNodeView[]
  layers: { id: string; label: string }[]
  /** The same blocks nested as the page holds them: rows, columns, blocks (PROG-E6B). */
  tree?: LayerTree
  /** What can be added under the selected block, presets first (PROG-E6B). */
  inserter?: CanvasInserterView
}

/** A change to the page that is not a field edit (PROG-E6B): a block moved to a slot, one spacing step on a
 *  block, or a new block under it. An insert already holds its block: the server resolved the id the tab sent. */
export type CanvasDocChange =
  | { kind: 'move'; to: LayerSlot }
  | { kind: 'spacing'; edge: SpacingEdge; step: SpacingStep }
  | { kind: 'insert'; type: string; content?: Record<string, unknown> }

/** One device bag as it crosses from the client: field key to a string or a boolean, nothing else. */
type CanvasFieldBag = Readonly<Partial<Record<string, string | boolean>>>
export type CanvasNodeValues = InspectorDeviceValues<Record<string, string | boolean>>

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

function fnv1a(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A stable hash of a stored document. Keys are sorted first, because jsonb does not keep the order a document
 *  was written in: the same document must hash the same before and after a trip through the database. */
export function canvasFingerprint(value: unknown): string {
  const text = JSON.stringify(value ?? null, (_key, v: unknown) => {
    const o = record(v)
    return o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v
  })
  return `${fnv1a(text, 0x811c9dc5).toString(36)}-${fnv1a(text, 0x9e3779b1).toString(36)}-${text.length.toString(36)}`
}

/** Read the canvas's document out of a Space's preferences: the draft, else the published page, as nodes. */
export function readCanvasDocument(preferences: unknown): CanvasDocument {
  const prefs = record(preferences) ?? {}
  const draft = prefs[CANVAS_DRAFT_KEY] ?? null
  const stored = draft ?? prefs[CANVAS_PUBLISHED_KEY] ?? null
  const counter = prefs[CANVAS_REVISION_KEY]
  const revision = typeof counter === 'number' && Number.isSafeInteger(counter) && counter > 0 ? counter : 0
  const layout = stored === null ? null : upgradeLayout(stored)
  const placed = layout ? canvasNodes(layout).length > 0 : false
  return {
    layout: placed ? layout : null,
    source: !placed ? 'none' : draft !== null ? 'draft' : 'published',
    base: { revision, fingerprint: canvasFingerprint(stored) },
  }
}

/** The placed nodes in reading order (row, then column, then stack). The bench is not on the page. */
export function canvasNodes(layout: NodeLayout): BlockNode[] {
  return layout.rows.flatMap((row) => row.cells.flat())
}

/** A layer per placed node, for the layer list. A second node of one type is numbered, so two Text blocks read
 *  as "Text" and "Text 2". `labelFor` is the block catalog's name for a type. */
export function canvasLayers(layout: NodeLayout, labelFor: (type: string) => string): { id: string; label: string }[] {
  const seen = new Map<string, number>()
  return canvasNodes(layout).map((node) => {
    const count = (seen.get(node.type) ?? 0) + 1
    seen.set(node.type, count)
    const label = labelFor(node.type)
    return { id: node.nid, label: count === 1 ? label : `${label} ${count}` }
  })
}

const drawable = (value: unknown): value is string | boolean => typeof value === 'string' || typeof value === 'boolean'

/** The stored bag with the inspector's own fields replaced by what it sent. Kept as stored: every key the
 *  inspector does not own (lists, cards, pickers: other editors' fields), and an inspector field whose stored
 *  value is not a string or a boolean and was not sent (an image held as a library asset: the inspector cannot
 *  draw or send it, so its silence is not a delete). An inspector string or boolean that was not sent is removed:
 *  that is a reset. Built from entries, never by assigning a client key. */
function mergeBag(stored: Record<string, unknown> | undefined, incoming: CanvasFieldBag | undefined, keys: ReadonlySet<string>): Record<string, unknown> {
  const sent = new Map(Object.entries(incoming ?? {}).filter(([key, value]) => keys.has(key) && drawable(value)))
  const kept = Object.entries(stored ?? {}).filter(([key, value]) => !keys.has(key) || (!sent.has(key) && !drawable(value)))
  return Object.fromEntries([...kept, ...sent])
}

/** One node's inspector values laid onto the document: desktop into `content`, tablet and phone into the sparse
 *  `responsive` bags. Null when the node is not in the document. Not yet sanitized: the write does that. */
export function applyCanvasNodeEdit(layout: NodeLayout, nid: string, values: CanvasNodeValues, fieldKeys: readonly string[]): NodeLayout | null {
  const node = getNode(layout, nid)
  if (!node) return null
  const keys = new Set(fieldKeys)
  const withContent = setNodeContent(layout, nid, mergeBag(node.content, values.desktop, keys))
  return setNodeResponsive(withContent, nid, {
    tablet: mergeBag(node.responsive?.tablet, values.tablet, keys),
    phone: mergeBag(node.responsive?.phone, values.phone, keys),
  })
}

/** One structural change laid onto the document, with the id of the block it left selected (the new block for an
 *  insert). `no-node` when the block is not placed on the page. `refused` when the page cannot take the change:
 *  a slot that is not there, a column that is full, a block at its per-page limit. Nothing is ever dropped to
 *  make room. Not yet sanitized: the write does that. */
export function applyCanvasChange(layout: NodeLayout, nid: string, change: CanvasDocChange): { layout: NodeLayout; nid: string } | 'no-node' | 'refused' {
  const at = findNode(layout, nid)
  const node = getNode(layout, nid)
  if (!node || at?.where !== 'placed') return 'no-node'
  const count = canvasNodes(layout).length
  if (change.kind === 'spacing') return { layout: setNodeStyle(layout, nid, withSpacing(node.style, change.edge, change.step)), nid }
  if (change.kind === 'move') {
    const moved = placeNode(layout, nid, change.to.rowId, change.to.col, change.to.index)
    return moved !== layout && canvasNodes(moved).length === count && findNode(moved, nid)?.where === 'placed' ? { layout: moved, nid } : 'refused'
  }
  const added = addNode(layout, change.type, at.rowId, at.col, at.index + 1)
  if (!added.nid || canvasNodes(added.layout).length !== count + 1) return 'refused'
  return { layout: change.content ? setNodeContent(added.layout, added.nid, change.content) : added.layout, nid: added.nid }
}

type CanvasDraftPlan =
  | { status: 'ready'; preferences: Record<string, unknown>; layout: NodeLayout; node: BlockNode; base: CanvasDraftBase }
  | { status: 'conflict'; current: CanvasDraftBase }
  | { status: 'no-document' | 'no-node' | 'invalid-document' | 'refused' }

/** Decide one draft write from a FRESH read of the Space's preferences. Pure: it edits nothing. A base that is
 *  not the stored one is a conflict and plans no write. Otherwise the plan holds the next preferences blob (the
 *  sanitized draft under the draft key, the counter moved on by one, every other key as read) and the base the
 *  tab holds after the write lands. The store must still compare the counter in the update itself. With a
 *  `change` the same plan carries a move, a spacing step or an insert, and `node` is the block it leaves selected. */
export function planCanvasDraftWrite({
  preferences, nid, values, fieldKeys, base, change,
}: {
  preferences: unknown
  nid: string
  values: CanvasNodeValues
  fieldKeys: readonly string[]
  base: CanvasDraftBase
  /** A structural change (PROG-E6B). When given, it is applied in place of the field edit. */
  change?: CanvasDocChange
}): CanvasDraftPlan {
  const current = readCanvasDocument(preferences)
  if (!current.layout) return { status: 'no-document' }
  if (base.revision !== current.base.revision || base.fingerprint !== current.base.fingerprint) return { status: 'conflict', current: current.base }
  if (current.base.revision >= Number.MAX_SAFE_INTEGER) return { status: 'invalid-document' }
  const changed = change ? applyCanvasChange(current.layout, nid, change) : null
  if (changed === 'no-node' || changed === 'refused') return { status: changed }
  const edited = changed ? changed.layout : applyCanvasNodeEdit(current.layout, nid, values, fieldKeys)
  if (!edited) return { status: 'no-node' }
  const layout = sanitizeNodeLayout(edited, 'space')
  const node = layout ? getNode(layout, changed ? changed.nid : nid) : null
  if (!layout || !node) return { status: 'invalid-document' }
  const revision = current.base.revision + 1
  return {
    status: 'ready',
    preferences: { ...(record(preferences) ?? {}), [CANVAS_DRAFT_KEY]: layout, [CANVAS_REVISION_KEY]: revision },
    layout,
    node,
    base: { revision, fingerprint: canvasFingerprint(layout) },
  }
}
