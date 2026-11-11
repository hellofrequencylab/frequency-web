// HISTORY RESTORE (BLD-403, spec docs/EDITOR-NEXT.md#bld-403). Pure: the history scrubber previews a stored
// page version and copies it, whole or one section at a time, into the editor's draft. Nothing here writes.
// Publishing the draft is the normal versioned publish; making an old version live is the pointer swap in
// revertPageToVersion. Both shapes a page document can take are handled:
//
//   * the page document (`Data`, lib/page-editor/types.ts): a section is a top-level item in `content` or in
//     one of the `zones`, named by `props.id`;
//   * the node tree (`NodeLayout`, lib/entity-blocks/node-tree.ts): a section is one `BlockNode`, placed or
//     benched, named by `nid` and found with node-ops.
//
// Unknown blocks are never consulted against a registry, so a block whose type left the library survives a
// restore byte for byte, in the draft and in the version (ADR-978). Inputs are never mutated.

import type { ContentItem, Data } from '@/lib/page-editor/types'
import type { BlockNode, NodeLayout } from '@/lib/entity-blocks/node-tree'
import { findNode, getNode } from '@/lib/entity-blocks/node-ops'

export type HistoryDoc = Data | NodeLayout

export function isNodeLayout(doc: unknown): doc is NodeLayout {
  const d = doc as NodeLayout | null
  return !!d && typeof d === 'object' && Array.isArray(d.rows) && Array.isArray(d.bench)
}

export function isPageData(doc: unknown): doc is Data {
  const d = doc as Data | null
  return !!d && typeof d === 'object' && Array.isArray(d.content) && !isNodeLayout(doc)
}

const copy = <T>(value: T): T => structuredClone(value)

/** The whole page back to the chosen version: a deep copy, equal to it, sharing nothing with it. */
export function restoreWhole(version: unknown): HistoryDoc | null {
  if (!isPageData(version) && !isNodeLayout(version)) return null
  return copy(version)
}

export type SectionRestore =
  | { ok: true; doc: HistoryDoc; inserted: boolean }
  | { ok: false; reason: 'shape' | 'missing' }

/** One section back to the chosen version. The section keeps its place in the draft; a section the draft
 *  no longer has goes back where the version had it (or on the bench when that row is gone). */
export function restoreSection(draft: unknown, version: unknown, id: string): SectionRestore {
  if (isPageData(draft) && isPageData(version)) return restorePageSection(draft, version, id)
  if (isNodeLayout(draft) && isNodeLayout(version)) return restoreNode(draft, version, id)
  return { ok: false, reason: 'shape' }
}

// ── the page document ────────────────────────────────────────────────────────────────────────────

type Where = { zone: string | null; index: number }

const itemId = (item: ContentItem | null | undefined): string | null => {
  const id = item?.props?.id
  return typeof id === 'string' && id ? id : null
}

function locate(doc: Data, id: string): Where | null {
  const at = doc.content.findIndex((item) => itemId(item) === id)
  if (at !== -1) return { zone: null, index: at }
  for (const [zone, items] of Object.entries(doc.zones ?? {})) {
    if (!Array.isArray(items)) continue
    const index = items.findIndex((item) => itemId(item) === id)
    if (index !== -1) return { zone, index }
  }
  return null
}

const listAt = (doc: Data, zone: string | null): ContentItem[] => (zone === null ? doc.content : doc.zones?.[zone] ?? [])

function withList(doc: Data, zone: string | null, list: ContentItem[]): Data {
  if (zone === null) return { ...doc, content: list }
  return { ...doc, zones: { ...(doc.zones ?? {}), [zone]: list } }
}

function restorePageSection(draft: Data, version: Data, id: string): SectionRestore {
  const from = locate(version, id)
  if (!from) return { ok: false, reason: 'missing' }
  const item = copy(listAt(version, from.zone)[from.index])
  const to = locate(draft, id)
  if (to) {
    const list = [...listAt(draft, to.zone)]
    list[to.index] = item
    return { ok: true, doc: withList(draft, to.zone, list), inserted: false }
  }
  const list = [...listAt(draft, from.zone)]
  list.splice(Math.min(from.index, list.length), 0, item)
  return { ok: true, doc: withList(draft, from.zone, list), inserted: true }
}

// ── the node tree ────────────────────────────────────────────────────────────────────────────────

function restoreNode(draft: NodeLayout, version: NodeLayout, nid: string): SectionRestore {
  const node = getNode(version, nid)
  if (!node) return { ok: false, reason: 'missing' }
  const restored: BlockNode = copy(node)
  const at = findNode(draft, nid)
  if (at?.where === 'bench') {
    const bench = [...draft.bench]
    bench[at.index] = restored
    return { ok: true, doc: { ...draft, bench }, inserted: false }
  }
  if (at?.where === 'placed') {
    return { ok: true, doc: placeAt(draft, restored, at.rowId, at.col, at.index, true), inserted: false }
  }
  const was = findNode(version, nid)
  if (was?.where === 'placed') {
    const row = draft.rows.find((r) => r.id === was.rowId)
    if (row && was.col < row.cells.length) {
      const index = Math.min(was.index, row.cells[was.col].length)
      return { ok: true, doc: placeAt(draft, restored, was.rowId, was.col, index, false), inserted: true }
    }
  }
  return { ok: true, doc: { ...draft, bench: [...draft.bench, restored] }, inserted: true }
}

function placeAt(layout: NodeLayout, node: BlockNode, rowId: string, col: number, index: number, replace: boolean): NodeLayout {
  const rows = layout.rows.map((row) => {
    if (row.id !== rowId) return row
    const cells = row.cells.map((stack, i) => {
      if (i !== col) return stack
      const next = [...stack]
      next.splice(index, replace ? 1 : 0, node)
      return next
    })
    return { ...row, cells }
  })
  return { ...layout, rows }
}

// ── the outline the preview shows ────────────────────────────────────────────────────────────────

export type SectionState = 'same' | 'changed' | 'missing'

export interface SectionEntry {
  id: string
  type: string
  label: string
  /** Against the draft: unchanged, edited since, or gone from the draft. */
  state: SectionState
}

const LABEL_KEYS = ['title', 'heading', 'headline', 'eyebrow', 'label', 'name']

function labelOf(type: string, bag: Record<string, unknown> | undefined): string {
  for (const key of LABEL_KEYS) {
    const value = bag?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 60)
  }
  return type
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Every section of a version, in order, marked against the draft. Empty for an unreadable document. */
export function sectionOutline(version: unknown, draft: unknown): SectionEntry[] {
  if (isPageData(version)) {
    const d = isPageData(draft) ? draft : null
    const lists = [version.content, ...Object.values(version.zones ?? {}).filter(Array.isArray)]
    return lists.flat().flatMap((item) => {
      const id = itemId(item)
      if (!id) return []
      const at = d ? locate(d, id) : null
      const mine = at && d ? listAt(d, at.zone)[at.index] : null
      return [{ id, type: item.type, label: labelOf(item.type, item.props), state: !mine ? 'missing' : same(mine, item) ? 'same' : 'changed' }]
    })
  }
  if (isNodeLayout(version)) {
    const d = isNodeLayout(draft) ? draft : null
    const nodes = [...version.rows.flatMap((r) => r.cells.flat()), ...version.bench]
    return nodes.map((node) => {
      const mine = d ? getNode(d, node.nid) : null
      return { id: node.nid, type: node.type, label: labelOf(node.type, node.content), state: !mine ? 'missing' : same(mine, node) ? 'same' : 'changed' }
    })
  }
  return []
}
