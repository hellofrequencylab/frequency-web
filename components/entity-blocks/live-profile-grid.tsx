'use client'

import { useEffect, type ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import { isFeatureDataSource, type BlockStyle } from '@/lib/entity-blocks/block-content'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { EntityGrid } from './entity-grid'
import { BlockStyleFrame, ContentBlockView, hasContent } from './content-block-view'
import { DesignBlockView, isDesignBlock } from './design-block-view'
import { useProfileLayout } from './profile-layout-context'

// THE LIVE PROFILE GRID (ADR-516 Phase C). The live-preview surface the in-rail builder edits. Every
// candidate block is rendered ONCE, server-side, into a keyed node map (`nodes`); this client wrapper places
// those already-rendered nodes into the freeform rows and subscribes to the shared ProfileLayoutContext.
// When the SIDEBAR arranger edits (reorder / columns / move-between-rows / bench / hide) the context repaints
// this grid INSTANTLY — zero round-trip — because the node for a moved block already exists in the DOM;
// placing it just moves it. When nothing is editing (or no provider is mounted) it renders the persisted
// `initialRows`, visually identical to a plain server render. Fail-safe: an unknown / hidden id renders
// nothing, and with no provider it falls straight back to the server layout.
//
// ADR-542 (revised): the page is the LIVE RESULT only — no editing chrome is ever overlaid here. The owner
// arranges the page in the sidebar (SpacePageBuilder) and watches this preview update; the visitor sees the
// identical render. Direct-manipulation-on-the-page was tried and removed at the owner's request.

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
  const content = store?.seeded ? store.content : initialContent

  // Drop hidden boxes from each column stack so a hidden block leaves the render (kept in the store).
  const displayRows: RowDef[] = rows.map((row) => ({
    ...row,
    cells: row.cells.map((stack) => stack.filter((id) => !hidden.has(id))),
  }))

  // Render each block, applying its STYLE frame here (client-side) so a background / spacing / alignment
  // edit shows instantly (the server nodes are rendered unstyled). A CONTENT block's body is ALSO drawn
  // client-side from the shared store (ContentBlockView) so a content edit — a Callout title, a gallery
  // image, a link — repaints the page THE INSTANT it is typed, with no server round-trip (ADR-542 item A).
  // A DATA block keeps its server node (its live-data body cannot be reproduced on the client); its authored
  // header/body reconcile through the debounced save (the builder refreshes just those).
  const renderBlock = (id: string): ReactNode => {
    const block = entityBlockById(id)
    let node: ReactNode
    if (isDesignBlock(id)) {
      // The five design blocks repaint from the shared store client-side (like the other content blocks), so
      // an authored edit shows instantly. An empty bag renders the design component's own honest-empty state.
      node = <DesignBlockView id={id} props={content[id] ?? {}} />
    } else if (block?.category === 'content') {
      const props = content[id]
      // A Features block sourced from live Space data (ADR-585) cannot resolve its items on the client, so it
      // keeps its SERVER node (which awaited the resolver) — mirroring how DATA blocks keep theirs. An authored
      // Features / any other content block still repaints instantly from the store.
      if (id === 'features' && isFeatureDataSource(props)) {
        node = nodes[id]
      } else {
        node = hasContent(id, props) ? <ContentBlockView id={id} props={props ?? {}} /> : nodes[id]
      }
    } else {
      node = nodes[id]
    }
    if (node == null) return null
    return <BlockStyleFrame style={style[id]}>{node}</BlockStyleFrame>
  }

  return <EntityGrid rows={displayRows} renderBlock={renderBlock} />
}
