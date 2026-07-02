// Pure, framework-free operations on a Puck `Data` document, used by the mobile
// editor. Every op returns a NEW document (never mutates), so React state updates
// stay predictable and the desktop <Puck> and mobile editor read/write one shape.
//
// A Puck content item is `{ type, props }` where `props.id` is the stable per-item
// key (see lib/spotlight/puck/convert.ts). These helpers keep that contract and add
// nothing Puck-specific beyond the `Data` shape, so they are trivially unit-testable.

import type { Config, Data } from '@/lib/page-editor/types'

type Item = Data['content'][number]

// A minimal view of a Puck component config entry — just what the mobile editor
// needs to derive labels, categories, defaults, and per-item summaries.
type ComponentEntry = {
  label?: string
  fields?: Record<string, unknown>
  defaultProps?: Record<string, unknown>
}

/** Read the `id` off a content item's props (Puck stores it there). */
export function itemId(item: Item): string {
  return String((item.props as { id?: unknown })?.id ?? '')
}

/** Generate a stable, collision-resistant id for a newly added block. Mirrors the
 *  `Type-xxxx` shape Puck itself uses, so ids stay readable in the saved document. */
export function makeItemId(type: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${type}-${rand}${Date.now().toString(36).slice(-4)}`
}

/** The list of block types the picker offers, grouped by the config's categories
 *  (falling back to a single "More" group for any component not placed in one).
 *  Pure derivation from the config — no React, no Puck runtime. */
export type PickerGroup = {
  key: string
  title: string
  items: { type: string; label: string }[]
}

export function derivePickerGroups(config: Config): PickerGroup[] {
  const components = (config.components ?? {}) as Record<string, ComponentEntry>
  const labelFor = (type: string) => components[type]?.label ?? type

  const groups: PickerGroup[] = []
  const placed = new Set<string>()

  const categories = (config.categories ?? {}) as Record<
    string,
    { title?: string; components?: readonly string[] }
  >
  for (const [key, cat] of Object.entries(categories)) {
    const types = (cat.components ?? []).filter((t) => t in components)
    if (types.length === 0) continue
    for (const t of types) placed.add(t)
    groups.push({
      key,
      title: cat.title ?? key,
      items: types.map((type) => ({ type, label: labelFor(type) })),
    })
  }

  // Any component not assigned to a category still needs to be addable.
  const orphaned = Object.keys(components).filter((t) => !placed.has(t))
  if (orphaned.length > 0) {
    groups.push({
      key: '__other',
      title: 'More',
      items: orphaned.map((type) => ({ type, label: labelFor(type) })),
    })
  }

  return groups
}

/** Build a new content item for `type`, seeded from the config's defaultProps and
 *  given a fresh id. Throws if the type is unknown (callers pick from the config). */
export function makeItem(config: Config, type: string): Item {
  const entry = (config.components as Record<string, ComponentEntry> | undefined)?.[type]
  if (!entry) throw new Error(`Unknown block type: ${type}`)
  const props = { ...(entry.defaultProps ?? {}), id: makeItemId(type) }
  return { type, props } as Item
}

/** Append a new block of `type` to the document. Returns the new document plus the
 *  id of the block that was added (so the caller can push straight to its edit screen). */
export function addBlock(
  data: Data,
  config: Config,
  type: string,
): { data: Data; id: string } {
  const item = makeItem(config, type)
  return {
    data: { ...data, content: [...data.content, item] },
    id: itemId(item),
  }
}

/** Remove the block with `id`. Returns the new document, the removed item, and the
 *  index it sat at (so an Undo can splice it back exactly where it was). */
export function removeBlock(
  data: Data,
  id: string,
): { data: Data; removed: Item | null; index: number } {
  const index = data.content.findIndex((it) => itemId(it) === id)
  if (index === -1) return { data, removed: null, index: -1 }
  const removed = data.content[index]
  const content = data.content.filter((_, i) => i !== index)
  return { data: { ...data, content }, removed, index }
}

/** Re-insert a previously removed item at `index` (used by Undo). */
export function insertBlockAt(data: Data, item: Item, index: number): Data {
  const content = [...data.content]
  const at = Math.max(0, Math.min(index, content.length))
  content.splice(at, 0, item)
  return { ...data, content }
}

/** Move the block at `from` to `to` (used by reorder / drag). Total: out-of-range
 *  indices are clamped, so a stray drag can never drop an item or throw. */
export function moveBlock(data: Data, from: number, to: number): Data {
  const len = data.content.length
  if (len === 0) return data
  const src = Math.max(0, Math.min(from, len - 1))
  const dst = Math.max(0, Math.min(to, len - 1))
  if (src === dst) return data
  const content = [...data.content]
  const [item] = content.splice(src, 1)
  content.splice(dst, 0, item)
  return { ...data, content }
}

/** Replace the props of the block with `id`. Merges `patch` into the existing props
 *  (keeping `id`), so an autosave of one field never drops the others. */
export function updateBlockProps(
  data: Data,
  id: string,
  patch: Record<string, unknown>,
): Data {
  const content = data.content.map((it) => {
    if (itemId(it) !== id) return it
    return { ...it, props: { ...it.props, ...patch, id } } as Item
  })
  return { ...data, content }
}

/** Find a block by id (or null). */
export function findBlock(data: Data, id: string): Item | null {
  return data.content.find((it) => itemId(it) === id) ?? null
}

/** The display title for a list row: the block's config `label`, else its type. */
export function blockTitle(config: Config, item: Item): string {
  const entry = (config.components as Record<string, ComponentEntry> | undefined)?.[item.type]
  return entry?.label ?? item.type
}

/** A one-line summary drawn from the block's props — the first non-empty short text
 *  value, trimmed. Gives the list row a preview line without knowing each block. */
export function blockSummary(item: Item): string {
  const props = item.props as Record<string, unknown>
  for (const [key, val] of Object.entries(props)) {
    if (key === 'id') continue
    if (typeof val === 'string' && val.trim()) {
      const s = val.trim().replace(/\s+/g, ' ')
      return s.length > 80 ? `${s.slice(0, 79)}…` : s
    }
  }
  return ''
}
