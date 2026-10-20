import { parseEntityLayout, type EntityLayout, type RowDef } from '@/lib/entity-blocks/layout'
import { applyBlockAliases } from '@/lib/entity-blocks/aliases'
import { hasNativeNodeStorage } from '@/lib/entity-blocks/legacy-write-guard'
import { upgradeLayout, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'

// THE TYPE-KEYED VIEW OF A NODE DOCUMENT (E0 task 12b). Readers that ask "which block types does this page
// place, and what does each type's copy say" (the website seed, the menu catalog, the module nav, the Contact
// tab, the house theme) were written against the legacy document, whose rows hold type ids and whose bags are
// keyed by type. A stored NATIVE node document parses to rows with EMPTY cells (the nodes ride beside them),
// so those readers saw an empty page. They read through here instead: a native document is projected to one
// shown row per distinct type, with the first node's bags; every other document parses exactly as before.
// Nodes remain the truth for the renderers (`nodes` is carried through); this is a read-only view. PURE.

/** One-column rows of the distinct shown types in reading order, with the first node's content and style bags.
 *  Maps then fromEntries: a node type is never an assigned property name (CodeQL js/remote-property-injection). */
export function nodeProjection(nodes: NodeLayout): EntityLayout {
  const first = new Map<string, BlockNode>()
  for (const n of nodes.rows.flatMap((row) => row.cells.flat())) if (n.hidden !== true && !first.has(n.type)) first.set(n.type, n)
  const rows: RowDef[] = [...first.keys()].map((type, i) => ({ id: `r${i}`, columns: 1, cells: [[type]] }))
  const bag = <T,>(pick: (n: BlockNode) => T | undefined) => {
    const entries = [...first].flatMap(([type, n]) => {
      const v = pick(n)
      return v === undefined ? [] : [[type, v] as const]
    })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  const out: EntityLayout = { rows, nodes }
  const content = bag((n) => n.content)
  if (content) out.content = content
  const style = bag((n) => n.style)
  if (style) out.style = style
  return out
}

/** Read a stored layout as the type-keyed grid: the projection for a native node document, the plain parse for
 *  everything else (so a legacy Space reads byte for byte as it did). */
export function readTypeKeyedGrid(raw: unknown): EntityLayout | null {
  if (hasNativeNodeStorage(raw)) {
    const nodes = upgradeLayout(raw)
    return nodes ? applyBlockAliases(nodeProjection(nodes)) : null
  }
  return parseEntityLayout(raw)
}
