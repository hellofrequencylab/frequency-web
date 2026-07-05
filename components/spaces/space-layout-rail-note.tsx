'use client'

import { MousePointerClick, Eye } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { addRow, placeBlock, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'

// THE SPACE LAYOUT RAIL NOTE (ADR-542). The space page layout is now edited ON THE PAGE (the WYSIWYG
// OnPageEditor over the live grid), so the cramped in-rail rows builder is retired here. This compact panel
// replaces it: a short line pointing the owner at the on-page editor, plus a "hidden sections" list so a
// section hidden from visitors can be restored from the rail too. It reads the SAME shared space-layout
// store the page editor drives, so a restore repaints the page instantly. Only renders on the space profile
// root (where the space store is mounted); everywhere else the store is not a space store, so it is null.
// Semantic DAWN tokens, no hex, voice canon (no em dashes).

const label = (id: string): string => entityBlockById(id)?.label ?? id

export function SpaceLayoutRailNote() {
  const store = useProfileLayout()
  // Guard to the space profile root, mirroring the retired builder: elsewhere the member store is mounted.
  if (!store || store.kind !== 'space') return null

  const layout: BuilderLayout = {
    rows: store.rows,
    hidden: store.hidden,
    content: store.content,
    style: store.style,
  }

  // Restore a hidden section: a hidden block is dropped from the rendered rows on reload, so bringing it
  // back means re-placing it (placeBlock also clears the hidden flag) at the foot of the page, into a fresh
  // row when the page has none. It repaints on the page instantly through the shared store.
  function onRestore(id: string) {
    const base = layout.rows.length === 0 ? addRow(layout) : layout
    const lastRow = base.rows[base.rows.length - 1]
    store!.apply(placeBlock(base, id, lastRow.id, 0))
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-3">
      <div className="flex items-start gap-2">
        <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <p className="text-xs text-muted">
          Edit your page right on the page. Hover any section to move, edit, or remove it, use the row
          controls to set columns, and Add block or Add row to build it out.
        </p>
      </div>

      {store.hidden.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Hidden sections</p>
          <ul className="flex flex-wrap gap-1.5">
            {store.hidden.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onRestore(id)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border bg-surface px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:border-primary hover:text-primary-strong"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden /> Show {label(id)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
