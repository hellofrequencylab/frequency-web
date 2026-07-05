'use client'

import { useEffect, type ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import { EntityGrid } from './entity-grid'
import { BlockStyleFrame } from './content-block-view'
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
  initialContent = {},
  initialStyle = {},
}: {
  /** Every candidate block, pre-rendered server-side (UNSTYLED) and keyed by block id. */
  nodes: Record<string, ReactNode>
  /** The persisted rows (from resolveRows) — the seed + the no-provider fallback. */
  initialRows: RowDef[]
  /** The persisted hidden ids — seeds the context so a hidden block starts off the render. */
  initialHidden?: string[]
  /** The persisted per-block content (ADR-528) — seeds the store so a content edit repaints instantly. */
  initialContent?: Record<string, Record<string, unknown>>
  /** The persisted per-block style (ADR-528/529) — applied CLIENT-side so a style edit shows instantly. */
  initialStyle?: Record<string, BlockStyle>
}) {
  const store = useProfileLayout()

  // Seed the shared store from the persisted layout on mount (idempotent — the first mounter wins).
  useEffect(() => {
    store?.seed(initialRows, initialHidden, initialContent, initialStyle)
  }, [store, initialRows, initialHidden, initialContent, initialStyle])

  // Prefer the live store once seeded; else the server layout (identical to today).
  const rows = store?.seeded ? store.rows : initialRows
  const hidden = new Set(store?.seeded ? store.hidden : initialHidden)
  const style = store?.seeded ? store.style : initialStyle

  // Null out hidden cells so a hidden block drops from the render (kept in its slot in the store).
  const displayRows: RowDef[] = rows.map((row) => ({
    ...row,
    slots: row.slots.map((id) => (id && !hidden.has(id) ? id : null)),
  }))

  // Apply each block's STYLE frame here (client-side) so a background / spacing / alignment edit shows
  // instantly — the server nodes are rendered unstyled (renderSpaceBlockNodes styled=false).
  const renderBlock = (id: string): ReactNode => {
    const node = nodes[id]
    if (node == null) return null
    return <BlockStyleFrame style={style[id]}>{node}</BlockStyleFrame>
  }

  return <EntityGrid rows={displayRows} renderBlock={renderBlock} />
}
