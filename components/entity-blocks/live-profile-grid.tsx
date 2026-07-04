'use client'

import { useEffect, type ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import { EntityGrid } from './entity-grid'
import { useProfileLayout } from './profile-layout-context'

// THE LIVE PROFILE GRID (ADR-516 Phase C). The WYSIWYG surface the in-rail builder edits. Every candidate
// member block is rendered ONCE, server-side, into a keyed node map (`nodes`); this client wrapper places
// those already-rendered nodes into the freeform rows and subscribes to the shared ProfileLayoutContext.
// When the builder edits (reorder / column count / place-from-bench / bench / hide) the context repaints
// this grid INSTANTLY — zero round-trip — because the node for a moved block already exists in the DOM;
// placing it just moves it. When nothing is editing (or no provider is mounted) it renders the persisted
// `initialRows`, visually identical to a plain server render. Fail-safe: an unknown / hidden id renders
// nothing, and with no provider it falls straight back to the server layout.

export function LiveProfileGrid({
  nodes,
  initialRows,
  initialHidden = [],
}: {
  /** Every candidate member block, pre-rendered server-side and keyed by block id. */
  nodes: Record<string, ReactNode>
  /** The persisted rows (from resolveRows) — the seed + the no-provider fallback. */
  initialRows: RowDef[]
  /** The persisted hidden ids — seeds the context so a hidden block starts off the render. */
  initialHidden?: string[]
}) {
  const store = useProfileLayout()

  // Seed the shared store from the persisted layout on mount (idempotent — the first mounter wins).
  useEffect(() => {
    store?.seed(initialRows, initialHidden)
  }, [store, initialRows, initialHidden])

  // Prefer the live store once seeded; else the server layout (identical to today).
  const rows = store?.seeded ? store.rows : initialRows
  const hidden = new Set(store?.seeded ? store.hidden : initialHidden)

  // Null out hidden cells so a hidden block drops from the render (kept in its slot in the store).
  const displayRows: RowDef[] = rows.map((row) => ({
    ...row,
    slots: row.slots.map((id) => (id && !hidden.has(id) ? id : null)),
  }))

  return <EntityGrid rows={displayRows} renderBlock={(id) => nodes[id] ?? null} />
}
