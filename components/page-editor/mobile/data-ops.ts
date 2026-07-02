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

// ─────────────────────────────────────────────────────────────────────────────
// SLOT-AWARE (DEEP) OPERATIONS — used by the DESKTOP editor, which (unlike the
// phone editor) edits nested blocks inside `slot`-typed regions (Container.content,
// Columns.col*, SpaceLayout main/side). Every block — top-level OR nested — carries
// a globally-unique `props.id` (Puck's contract, preserved by makeItemId/reidDeep),
// so these ops address blocks by id and search the whole tree: content plus every
// `slot`-typed prop, recursively. Like the top-level ops above they are PURE and
// return a NEW document, and they NEVER touch `root`/`zones` or reshape a block from
// `{ type, props }`, so the persisted `Data` shape stays byte-for-byte identical.
// ─────────────────────────────────────────────────────────────────────────────

type FieldEntry = { type?: string; label?: string }

/** The `slot`-typed prop keys a block type exposes (its nested-block regions). */
function slotKeysOf(config: Config, type: string): string[] {
  const fields = (config.components as Record<string, { fields?: Record<string, FieldEntry> }> | undefined)?.[type]
    ?.fields
  if (!fields) return []
  return Object.keys(fields).filter((k) => fields[k]?.type === 'slot')
}

/** The nested-block regions of a block type, with display labels (for the outline). */
export function slotFieldsFor(config: Config, type: string): { key: string; label: string }[] {
  const fields = (config.components as Record<string, { fields?: Record<string, FieldEntry> }> | undefined)?.[type]
    ?.fields
  if (!fields) return []
  return Object.keys(fields)
    .filter((k) => fields[k]?.type === 'slot')
    .map((k) => ({ key: k, label: fields[k]?.label ?? k }))
}

/** The items currently held in a block's `slotKey` region (empty if unset). */
function slotArray(item: Item, key: string): Item[] {
  const v = (item.props as Record<string, unknown>)[key]
  return Array.isArray(v) ? (v as Item[]) : []
}

type ArrayOp = (arr: Item[], index: number) => Item[]

// Find the array that DIRECTLY contains `id` (content or any nested slot) and apply
// `op` to it, rebuilding the tree above it immutably. Returns { items, done }.
function opContainingArray(
  items: Item[],
  config: Config,
  id: string,
  op: ArrayOp,
): { items: Item[]; done: boolean } {
  const idx = items.findIndex((it) => itemId(it) === id)
  if (idx !== -1) return { items: op(items, idx), done: true }
  let done = false
  const next = items.map((it) => {
    if (done) return it
    let changed = it
    for (const key of slotKeysOf(config, it.type)) {
      if (done) break
      const res = opContainingArray(slotArray(changed, key), config, id, op)
      if (res.done) {
        done = true
        changed = { ...changed, props: { ...changed.props, [key]: res.items } } as Item
      }
    }
    return changed
  })
  return { items: next, done }
}

// Find the item WITH `id` (anywhere in the tree) and replace it with `fn(item)`.
function opItemById(
  items: Item[],
  config: Config,
  id: string,
  fn: (item: Item) => Item,
): { items: Item[]; done: boolean } {
  let done = false
  const next = items.map((it) => {
    if (done) return it
    if (itemId(it) === id) {
      done = true
      return fn(it)
    }
    let changed = it
    for (const key of slotKeysOf(config, it.type)) {
      if (done) break
      const res = opItemById(slotArray(changed, key), config, id, fn)
      if (res.done) {
        done = true
        changed = { ...changed, props: { ...changed.props, [key]: res.items } } as Item
      }
    }
    return changed
  })
  return { items: next, done }
}

/** Find a block by id anywhere in the tree (content + nested slots), or null. */
export function findBlockDeep(data: Data, config: Config, id: string): Item | null {
  const walk = (items: Item[]): Item | null => {
    for (const it of items) {
      if (itemId(it) === id) return it
      for (const key of slotKeysOf(config, it.type)) {
        const found = walk(slotArray(it, key))
        if (found) return found
      }
    }
    return null
  }
  return walk(data.content)
}

/** Merge `patch` into the props of the block with `id`, anywhere in the tree (keeps
 *  `id`). No-op if the id isn't found. */
export function updateBlockPropsDeep(
  data: Data,
  config: Config,
  id: string,
  patch: Record<string, unknown>,
): Data {
  const res = opContainingArray(data.content, config, id, (arr, i) =>
    arr.map((it, j) => (j === i ? ({ ...it, props: { ...it.props, ...patch, id } } as Item) : it)),
  )
  return res.done ? { ...data, content: res.items } : data
}

/** Remove the block with `id` from wherever it lives (content or a nested slot).
 *  Returns the new doc + the removed item (null if not found). */
export function removeBlockDeep(
  data: Data,
  config: Config,
  id: string,
): { data: Data; removed: Item | null } {
  let removed: Item | null = null
  const res = opContainingArray(data.content, config, id, (arr, i) => {
    removed = arr[i]
    return arr.filter((_, j) => j !== i)
  })
  return res.done ? { data: { ...data, content: res.items }, removed } : { data, removed: null }
}

/** Move the block with `id` one step up (-1) or down (+1) WITHIN its own parent
 *  region. Clamped at the ends (a no-op if already first/last). */
export function nudgeBlock(data: Data, config: Config, id: string, delta: -1 | 1): Data {
  const res = opContainingArray(data.content, config, id, (arr, i) => {
    const j = i + delta
    if (j < 0 || j >= arr.length) return arr
    const next = [...arr]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  return res.done ? { ...data, content: res.items } : data
}

// Deep-clone an item with FRESH ids for it and every nested slot child, so a
// duplicated subtree never collides ids with the original (ids stay globally unique).
function reidDeep(item: Item, config: Config): Item {
  const props: Record<string, unknown> = { ...item.props, id: makeItemId(item.type) }
  for (const key of slotKeysOf(config, item.type)) {
    const arr = props[key]
    if (Array.isArray(arr)) props[key] = (arr as Item[]).map((child) => reidDeep(child, config))
  }
  return { ...item, props } as Item
}

/** Duplicate the block with `id` (deep, re-ided) directly after itself in its own
 *  region. Returns the new doc + the new block's id (empty string if not found). */
export function duplicateBlockDeep(data: Data, config: Config, id: string): { data: Data; id: string } {
  let newId = ''
  const res = opContainingArray(data.content, config, id, (arr, i) => {
    const copy = reidDeep(arr[i], config)
    newId = itemId(copy)
    const next = [...arr]
    next.splice(i + 1, 0, copy)
    return next
  })
  return res.done ? { data: { ...data, content: res.items }, id: newId } : { data, id: '' }
}

/** Append a new block of `type` into the `slotKey` region of the block `parentId`.
 *  Returns the new doc + the added block's id (empty string if the parent isn't found). */
export function addBlockToSlot(
  data: Data,
  config: Config,
  parentId: string,
  slotKey: string,
  type: string,
): { data: Data; id: string } {
  const item = makeItem(config, type)
  const res = opItemById(data.content, config, parentId, (parent) => {
    const cur = slotArray(parent, slotKey)
    return { ...parent, props: { ...parent.props, [slotKey]: [...cur, item] } } as Item
  })
  return res.done ? { data: { ...data, content: res.items }, id: itemId(item) } : { data, id: '' }
}

/** A drop target for {@link moveBlockTo}: a region + an index within it. `parentId`
 *  null means the top-level content region (slotKey ignored). */
export type MoveTarget = { parentId: string | null; slotKey: string | null; index: number }

/** Move an existing block (by id) to `target` — reorder within a region OR move it
 *  into a different region/slot (the "move into slot" op). Refuses to drop a block
 *  into itself or its own descendant (which would detach the subtree). Index is
 *  clamped, so a stray drop can never lose a block. */
export function moveBlockTo(data: Data, config: Config, id: string, target: MoveTarget): Data {
  if (target.parentId) {
    if (target.parentId === id) return data
    const moving = findBlockDeep(data, config, id)
    // Illegal if the target parent lives inside the moving block's own subtree.
    if (moving && findBlockDeep({ root: {}, content: [moving] }, config, target.parentId)) return data
  }
  const { data: without, removed } = removeBlockDeep(data, config, id)
  if (!removed) return data

  if (!target.parentId) {
    const content = [...without.content]
    const at = Math.max(0, Math.min(target.index, content.length))
    content.splice(at, 0, removed)
    return { ...without, content }
  }
  const slotKey = target.slotKey ?? ''
  const res = opItemById(without.content, config, target.parentId, (parent) => {
    const next = [...slotArray(parent, slotKey)]
    const at = Math.max(0, Math.min(target.index, next.length))
    next.splice(at, 0, removed as Item)
    return { ...parent, props: { ...parent.props, [slotKey]: next } } as Item
  })
  return res.done ? { ...without, content: res.items } : data
}

/** One node of the editor's block outline: a block plus its nested slot regions. */
export type OutlineNode = {
  id: string
  type: string
  label: string
  summary: string
  slots: { key: string; label: string; children: OutlineNode[] }[]
}

/** Build the block outline (a tree mirroring the document + its slot regions) that
 *  the desktop editor renders as its layers/select surface. Pure derivation. */
export function buildOutline(data: Data, config: Config): OutlineNode[] {
  const build = (items: Item[]): OutlineNode[] =>
    items.map((it) => ({
      id: itemId(it),
      type: it.type,
      label: blockTitle(config, it),
      summary: blockSummary(it),
      slots: slotFieldsFor(config, it.type).map((s) => ({
        key: s.key,
        label: s.label,
        children: build(slotArray(it, s.key)),
      })),
    }))
  return build(data.content)
}
