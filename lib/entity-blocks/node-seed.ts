// THE OWNER'S NODE SEED (E0 task 12b, ADR-1851). The node document the Space editor opens on: the stored
// document read as nodes (`EntityLayout.nodes`, which `parseEntityLayout` attaches for a stored `rows`
// document of either shape), or, for a Space that never saved a layout, the starter rows upgraded. DATA
// blocks (About, Offerings, ...) are then filled with their EFFECTIVE content where the node has none, so
// an editor opens showing the section's current words (effective-block-content.ts); a CONTENT block keeps
// exactly its own bag, because two Text nodes must never share one. Pure.

import { entityBlockById } from './registry'
import { resolveRows, type EntityLayout } from './layout'
import { upgradeLayout, type BlockNode, type NodeLayout } from './node-tree'

export function ownerNodeLayout(
  saved: EntityLayout | null,
  effectiveContent: Record<string, Record<string, unknown>> = {},
  kind: 'space' | 'member' = 'space',
): NodeLayout {
  const base: NodeLayout =
    saved?.nodes ??
    upgradeLayout({
      rows: resolveRows(saved, kind),
      hidden: saved?.hidden ?? [],
      content: saved?.content ?? {},
      style: saved?.style ?? {},
    }) ?? { rows: [], bench: [] }
  const fill = (n: BlockNode): BlockNode => {
    if (entityBlockById(n.type)?.category !== 'data') return n
    const effective = effectiveContent[n.type]
    if (!effective) return n
    return { ...n, content: { ...effective, ...(n.content ?? {}) } }
  }
  return {
    ...base,
    rows: base.rows.map((row) => ({ ...row, cells: row.cells.map((stack) => stack.map(fill)) })),
    bench: base.bench.map(fill),
  }
}
