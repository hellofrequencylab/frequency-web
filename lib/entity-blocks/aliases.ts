import type { EntityLayout, RowDef } from '@/lib/entity-blocks/layout'

// THE READ-TIME ALIAS LAYER (PROG-E2 step 1, docs/EDITOR-ARCHITECTURE.md E2). Consolidation retires block ids, and a
// stored layout still names the old id. Rather than rewrite stored documents first, the reader maps an old id to
// its replacement as it parses, so a retirement is: add the alias, wait for the usage census to read zero, delete
// the alias. NO STORED DATA CHANGES: nothing here is ever written back.
//
// The map starts EMPTY on purpose. The target block set is not decided (the census plan holds the eleven core Space
// blocks for the owner's separate approval), and an alias is only safe for a provably 1:1 rename. Each entry added
// later must say in a comment which census row it retires. check:blocks fails an alias whose target is not an
// adopted contract block, whose old id is still adopted, that points at itself, or that chains into another alias.
//
// Keyed by Map, never a plain object: a block id is stored user data (CodeQL js/remote-property-injection).

/** old block id -> the block id that replaces it. Empty until a retirement is approved. */
export const BLOCK_ID_ALIASES: ReadonlyMap<string, string> = new Map()

/** The id a stored block id reads as. Unknown ids and ids with no alias come back unchanged. */
export function resolveBlockId(id: string, aliases: ReadonlyMap<string, string> = BLOCK_ID_ALIASES): string {
  return aliases.get(id) ?? id
}

const dedupe = (ids: string[]) => [...new Set(ids)]

/** Rewrite the type-keyed parts of a parsed layout (rows, slots, hidden, order, content, style) through the alias
 *  map. Returns the SAME object when the map is empty. When both an old and a new key carry content, the new key wins.
 *  The native `nodes` document is left alone: node types resolve through the registry at render. PURE. */
export function applyBlockAliases(layout: EntityLayout, aliases: ReadonlyMap<string, string> = BLOCK_ID_ALIASES): EntityLayout {
  if (aliases.size === 0) return layout
  const ids = (list: string[]) => dedupe(list.map((id) => resolveBlockId(id, aliases)))
  const bag = <T,>(m: Record<string, T> | undefined) => {
    if (!m) return m
    const merged = new Map<string, T>()
    for (const [k, v] of Object.entries(m)) if (aliases.has(k)) merged.set(resolveBlockId(k, aliases), v)
    for (const [k, v] of Object.entries(m)) if (!aliases.has(k)) merged.set(k, v)
    return Object.fromEntries(merged)
  }
  const out: EntityLayout = { ...layout }
  if (layout.rows) out.rows = layout.rows.map((row): RowDef => ({ ...row, cells: row.cells.map(ids) }))
  if (layout.slots) out.slots = Object.fromEntries(Object.entries(layout.slots).map(([slot, list]) => [slot, ids(list)]))
  if (layout.hidden) out.hidden = ids(layout.hidden)
  if (layout.order) out.order = ids(layout.order)
  if (layout.content) out.content = bag(layout.content)
  if (layout.style) out.style = bag(layout.style)
  return out
}
