'use client'

import { useEffect, type ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import { EntityGrid } from './entity-grid'
import { BlockStyleFrame } from './content-block-view'
import { useProfileLayout } from './profile-layout-context'
import { OnPageEditor } from './on-page-editor'

// THE LIVE PROFILE GRID (ADR-516 Phase C). The WYSIWYG surface the in-rail builder edits. Every candidate
// member block is rendered ONCE, server-side, into a keyed node map (`nodes`); this client wrapper places
// those already-rendered nodes into the freeform rows and subscribes to the shared ProfileLayoutContext.
// When the builder edits (reorder / column count / place-from-bench / bench / hide) the context repaints
// this grid INSTANTLY — zero round-trip — because the node for a moved block already exists in the DOM;
// placing it just moves it. When nothing is editing (or no provider is mounted) it renders the persisted
// `initialRows`, visually identical to a plain server render. Fail-safe: an unknown / hidden id renders
// nothing, and with no provider it falls straight back to the server layout.
//
// ON-PAGE EDIT (ADR-542): when `editable` is set (the owner's space live preview only), once the shared
// store has seeded, this swaps the plain grid for the OnPageEditor — the same block nodes with direct-
// manipulation chrome overlaid, right on the page. A visitor / non-owner never passes `editable`, so their
// render stays byte-identical (no chrome, no store dependency).

export function LiveProfileGrid({
  nodes,
  initialRows,
  initialHidden = [],
  initialContent = {},
  initialStyle = {},
  editable = false,
  editSlug,
  lockedIds,
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
  /** OWNER-only (ADR-542): overlay the on-page WYSIWYG editing chrome once the store has seeded. */
  editable?: boolean
  /** The space slug (edit mode only) — builds each data block's "Manage" deep-link. */
  editSlug?: string
  /** Block ids the space cannot offer yet (edit mode only) — held out of the Add-block palette. */
  lockedIds?: string[]
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

  // Drop hidden boxes from each column stack so a hidden block leaves the render (kept in the store).
  const displayRows: RowDef[] = rows.map((row) => ({
    ...row,
    cells: row.cells.map((stack) => stack.filter((id) => !hidden.has(id))),
  }))

  // Apply each block's STYLE frame here (client-side) so a background / spacing / alignment edit shows
  // instantly — the server nodes are rendered unstyled (renderSpaceBlockNodes styled=false).
  const renderBlock = (id: string): ReactNode => {
    const node = nodes[id]
    if (node == null) return null
    return <BlockStyleFrame style={style[id]}>{node}</BlockStyleFrame>
  }

  // OWNER on-page editor (ADR-542): once the store has seeded, swap the plain grid for the editing overlay.
  // Before the seed (first paint) fall through to the identical server render, so there is no empty flash.
  if (editable && editSlug && store?.kind === 'space' && store.seeded) {
    return <OnPageEditor renderBlock={renderBlock} slug={editSlug} lockedIds={lockedIds} />
  }

  return <EntityGrid rows={displayRows} renderBlock={renderBlock} />
}
