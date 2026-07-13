'use client'

import { useEffect, type ReactNode } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import { isFeatureDataSource, type BlockStyle } from '@/lib/entity-blocks/block-content'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { EntityGrid } from './entity-grid'
import { BlockStyleFrame, ContentBlockView, hasContent } from './content-block-view'
import { DesignBlockView, isDesignBlock } from './design-block-view'
import { useProfileLayout } from './profile-layout-context'
import { useSpaceEditMode } from './space-edit-mode'
import { SpaceCanvasBlock } from './space-canvas/space-canvas-block'
import { SpaceEditNotice } from './space-edit-notice'

// THE LIVE PROFILE GRID (ADR-516 Phase C). The live-preview surface the in-rail builder edits. Every
// candidate block is rendered ONCE, server-side, into a keyed node map (`nodes`); this client wrapper places
// those already-rendered nodes into the freeform rows and subscribes to the shared ProfileLayoutContext.
// When the SIDEBAR arranger edits (reorder / columns / move-between-rows / bench / hide) the context repaints
// this grid INSTANTLY — zero round-trip — because the node for a moved block already exists in the DOM;
// placing it just moves it. When nothing is editing (or no provider is mounted) it renders the persisted
// `initialRows`, visually identical to a plain server render. Fail-safe: an unknown / hidden id renders
// nothing, and with no provider it falls straight back to the server layout.
//
// LIVE-PAGE EDIT MODE (Edit Space, owner directive): when the Space owner opens the rail, the page STOPS
// being read-only and every block becomes editable IN PLACE — text through the SpaceEditableSlot bubble,
// single photos through the SpaceImagePopup (both via SpaceCanvasBlock, the same on-canvas primitives the
// /manage/layout editor uses). Clicking a block focuses its settings in the rail (shared selection through
// the store). Off edit mode (and for a member grid, and for a visitor / no provider) the render is exactly
// as before — the read-only ContentBlockView / server node. The rail holds SETTINGS + the row arranger
// only; no content text is edited there (the isCoreField split lives in the builder + BlockEditPanel).

export function LiveProfileGrid({
  nodes,
  initialRows,
  initialHidden = [],
  initialContent = {},
  initialStyle = {},
  spaceSlug,
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
  /** The Space slug — present ONLY on the Space owner preview. Its presence (with a seeded space store, in
   *  edit mode) is what turns on the on-page inline editors; absent on the member grid / visitor render. */
  spaceSlug?: string
}) {
  const store = useProfileLayout()
  const editMode = useSpaceEditMode()

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

  // On-page inline editing is live ONLY for the Space owner (a seeded space store + a slug) while the rail is
  // open (edit mode). Off any of those, this is the plain read-only render, byte-for-byte as before.
  const editable = editMode && !!spaceSlug && !!store?.seeded && store.kind === 'space'

  // Merge one content field into the shared store (sparse: an empty value clears the key). Repaints the page
  // instantly and debounce-saves through the same action the rail arranger uses — persistence is unchanged.
  const setField = (blockId: string, key: string, value: unknown) => {
    if (!store) return
    const props = { ...(store.content[blockId] ?? {}) }
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete props[key]
    else props[key] = value
    store.applyContent(blockId, Object.keys(props).length ? props : undefined)
  }

  // Render each block, applying its STYLE frame here (client-side) so a background / spacing / alignment
  // edit shows instantly (the server nodes are rendered unstyled). A CONTENT block's body is ALSO drawn
  // client-side from the shared store (ContentBlockView) so a content edit — a Callout title, a gallery
  // image, a link — repaints the page THE INSTANT it is typed, with no server round-trip (ADR-542 item A).
  // A DATA block keeps its server node (its live-data body cannot be reproduced on the client); its authored
  // header/body reconcile through the debounced save (the builder refreshes just those).
  const renderBlock = (id: string): ReactNode => {
    // EDIT MODE: render the block through the on-canvas editor (SpaceCanvasBlock) IN PLACE — its TEXT fields
    // become inline-editable slots and its Features / Cards item copy edits inline; a single photo shows its
    // preview here and is set in the rail (its URL / upload is a structural setting, matching the /manage/layout
    // canvas). Clicking the block focuses its settings in the rail (shared selection). The editable block is
    // WRAPPED in its BlockStyleFrame (style[id]) so the operator's chosen background / spacing / alignment AND
    // the page theme show while editing — the edit surface looks like the published page, not a raw stack.
    if (editable) {
      const selected = store?.selectedId === id
      return (
        <div
          key={id}
          role="group"
          onMouseDown={() => store?.select(id)}
          className={`rounded-lg p-2 transition-colors ${
            selected ? 'bg-primary-bg/30 ring-1 ring-primary' : 'hover:bg-surface-elevated/40'
          }`}
        >
          <BlockStyleFrame style={style[id]}>
            <SpaceCanvasBlock id={id} props={content[id] ?? {}} onField={(k, v) => setField(id, k, v)} />
          </BlockStyleFrame>
        </div>
      )
    }

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

  return (
    <>
      {/* A friendly instruction banner while the owner is editing (edit mode only) — names what the page click
          and the right-hand panel each do, so a first-time owner is never lost. */}
      {editable && <SpaceEditNotice />}
      <EntityGrid rows={displayRows} renderBlock={renderBlock} />
    </>
  )
}
