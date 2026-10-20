'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { isFeatureDataSource } from '@/lib/entity-blocks/block-content'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { resolveNodeRows, setNodeContent } from '@/lib/entity-blocks/node-ops'
import type { BlockNode, NodeLayout } from '@/lib/entity-blocks/node-tree'
import { EntityGrid } from './entity-grid'
import { BlockStyleFrame, ContentBlockView, hasContent } from './content-block-view'
import { DesignBlockView, isDesignBlock } from './design-block-view'
import { useNodeLayout } from './node-layout-store'
import { useSpaceEditMode } from './space-edit-mode'
import { SpaceCanvasBlock } from './space-canvas/space-canvas-block'
import { SpaceEditNotice } from './space-edit-notice'
import { SpacePublishFab } from './space-publish-fab'

// THE LIVE NODE GRID (E0 task 12b, ADR-1838). `LiveProfileGrid` for a node document: same props, same
// markup, same edit-mode behaviour, but every placement is a NODE read from the node store (ADR-1835), so
// two Text blocks are two blocks with two content bags and two selections instead of one bag shared by
// type. The server still pre-renders each candidate block once, keyed by block TYPE (a data block is capped
// at one per type, and a content block draws client-side from its node's own bag), so `nodes` is unchanged.
//
// DORMANT: nothing renders this yet. The owner preview picks it behind `render_path_space_profile` once
// the builder is on the node store too (ADR-1833). Until then `LiveProfileGrid` stays the only grid.

export function LiveNodeGrid({
  nodes,
  initialLayout,
  spaceSlug,
  profilePublished = true,
  hasUnpublishedChanges = false,
}: {
  /** Every candidate block, pre-rendered server-side (UNSTYLED) and keyed by block TYPE. */
  nodes: Record<string, ReactNode>
  /** The persisted node document: the seed, and the no-provider fallback. */
  initialLayout: NodeLayout
  spaceSlug?: string
  profilePublished?: boolean
  hasUnpublishedChanges?: boolean
}) {
  const store = useNodeLayout()
  const editMode = useSpaceEditMode()

  // The on-page wrapper of each editable node, so a rail selection can scroll its block into view. A Map,
  // not a Record: the key is a node id, and an object write keyed by it is a CodeQL property-injection sink.
  const blockRefs = useRef(new Map<string, HTMLDivElement | null>())
  const lastScrolledNid = useRef<string | null>(null)

  useEffect(() => {
    store?.seed(initialLayout)
  }, [store, initialLayout])

  const layout = store?.seeded && store.layout ? store.layout : initialLayout
  const rows = resolveNodeRows(layout, 'space')

  const editable = editMode && !!spaceSlug && !!store?.seeded
  const selectedNid = store?.selectedNid ?? null
  useEffect(() => {
    if (!editable || !selectedNid || selectedNid === lastScrolledNid.current) return
    lastScrolledNid.current = selectedNid
    blockRefs.current.get(selectedNid)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editable, selectedNid])

  // Merge one content field into the node's bag against the FRESHEST layout (`edit` folds over a ref), so
  // two writes in one tick both land: the photo popup commits `image` then `alt`. An empty value clears the key.
  const setField = (nid: string, key: string, value: unknown) => {
    store?.edit((current) => {
      const bag = { ...(findContent(current, nid) ?? {}) }
      const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
      if (empty) delete bag[key]
      else bag[key] = value
      return setNodeContent(current, nid, Object.keys(bag).length ? bag : undefined)
    })
  }

  const renderBlock = (node: BlockNode): ReactNode => {
    const { nid, type } = node
    const props = node.content ?? {}
    if (editable) {
      const selected = selectedNid === nid
      return (
        <div
          key={nid}
          ref={(el) => {
            blockRefs.current.set(nid, el)
          }}
          role="group"
          onMouseDown={() => store?.select(nid)}
          className={`rounded-control p-2 transition-colors ${
            selected ? 'bg-primary-bg/30 ring-1 ring-primary' : 'hover:bg-surface-elevated/40'
          }`}
        >
          <BlockStyleFrame style={node.style}>
            <SpaceCanvasBlock
              id={type}
              nid={nid}
              props={props}
              node={nodes[type]}
              loomScope={spaceSlug ?? 'mine'}
              onField={(k, v) => setField(nid, k, v)}
            />
          </BlockStyleFrame>
        </div>
      )
    }

    const block = entityBlockById(type)
    let out: ReactNode
    if (isDesignBlock(type)) {
      out = <DesignBlockView id={type} props={props} />
    } else if (block?.category === 'content') {
      if ((type === 'features' && isFeatureDataSource(node.content)) || type === 'contactForm') {
        out = nodes[type]
      } else {
        out = hasContent(type, node.content) ? <ContentBlockView id={type} props={props} /> : nodes[type]
      }
    } else {
      out = nodes[type]
    }
    if (out == null) return null
    return <BlockStyleFrame style={node.style}>{out}</BlockStyleFrame>
  }

  return (
    <>
      {editable && <SpaceEditNotice />}
      <EntityGrid<BlockNode> rows={rows} renderBlock={renderBlock} />
      {(editable || hasUnpublishedChanges) && spaceSlug && (
        <SpacePublishFab
          slug={spaceSlug}
          initialPublished={profilePublished}
          hasUnpublishedChanges={hasUnpublishedChanges}
          editable={editable}
        />
      )}
    </>
  )
}

function findContent(layout: NodeLayout, nid: string): Record<string, unknown> | undefined {
  for (const row of layout.rows) for (const stack of row.cells) for (const n of stack) if (n.nid === nid) return n.content
  return layout.bench.find((n) => n.nid === nid)?.content
}
