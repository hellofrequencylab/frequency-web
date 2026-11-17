'use client'

// THE CANVAS WITH A SHARED TEXT FIELD (PROG-E4B, PROG-E4C). The viewport shell (same-origin iframe, device widths) holding a
// CollabTextEditor bound to a Y.Doc. With a spaceId the doc joins that Space's private editing channel
// (the same `editor:space:<id>` room the Space page builder uses, authorized by the same policy), so two browsers
// converge on the text; without one it stays local. The text lives in the doc's own `text` map, so the page
// builder's layout is untouched, and nothing here is persisted. Editor only: allowlisted for check:editor-crdt-importers, mounted
// only by the staff-gated, flag-gated /pages/canvas.
//
// Inspector (PROG-E5): given a block's fields, the canvas also mounts the responsive inspector beside the frame. It
// shares the frame's device, so switching to Phone edits phone values, and the frame draws the values that device
// resolves to. The block is a BlockNode whose tablet and phone edits are stored as sparse `responsive` overrides; the page holds it locally. Under it, Vera's questions for the block
// (PROG-E8): questions only, at creation or when asked, never a write to a field.
//
// A real document (PROG-E5B): given `document`, the inspector edits the node picked in the layer list instead of
// the demo block, and each edit is saved to that Space page's draft (use-canvas-document.ts). The demo block and
// Vera's demo coach stay for a canvas with no document.
//
// The page's shape (PROG-E6B): on a real document the layer list is the page's tree (rows, columns, blocks) and a
// move in it is saved; the selected block carries spacing handles in the frame; and a block can be added under it,
// presets first. All three go through the same draft write as a field edit.
//
// Duplicate, hide, remove and undo (PROG-E6C): the selected block carries those four above its inspector, through
// the same write. On a phone the frame, the inspector and Layers stack in one column with nothing wider than it.
//
// The whole page (PROG-E6E): on a real document the frame draws every block, row by row at each row's split (one
// column on Phone), and tapping one selects it. Before, it drew only the selected block.
//
// Presence (BLD-401): on a shared Space the link also carries who is here (faces above the canvas) and which node
// each person is in (an outline on that node inside the frame). It rides the channel, never the doc.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import type { BuilderDevice } from '@/lib/builder/state'
import type { InspectorFieldView } from '@/lib/builder/inspector-fields'
import type { InspectorDeviceValues } from '@/lib/builder/inspector-model'
import type { CanvasDocumentView } from '@/lib/builder/canvas-document'
import { nodeDeviceValues, withDeviceValues } from '@/lib/builder/node-responsive'
import type { BlockNode } from '@/lib/entity-blocks/node-tree'
import { ResponsiveInspector } from '@/components/builder/inspector/responsive-inspector'
import { VeraBlockCoach } from '@/components/builder/inspector/vera-block-coach'
import { BlockActions } from './block-actions'
import { BlockInserter } from './block-inserter'
import { CanvasDocumentStatus } from './canvas-document-status'
import { BlockWords, CanvasPagePreview } from './canvas-page-preview'
import { CanvasViewportShell } from './canvas-viewport-shell'
import { CollabTextEditor } from './collab-text-editor'
import { LayerList, type Layer } from './layer-list'
import { SpacingHandles } from './spacing-handles'
import { useCanvasDocument } from './use-canvas-document'
import { EditorPresenceFaces } from '@/components/builder/presence/presence-ui'
import type { PresenceState } from '@/lib/editor-crdt/awareness'

const SEED = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Write here' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'This text lives in a shared document. Edit it and the change is a CRDT update.' }] },
  ],
}

type Link = 'local' | 'connecting' | 'live' | 'offline'

/** The demo text node's id: a real node id shape, so a selection of it is a valid presence payload. */
const CANVAS_NID = 'ncanvasdemo'
const CANVAS_BLOCK_NID = 'ncanvasblock'

/** The demo page's sections for the layer list (PROG-E6A). Local order only; nothing is saved. */
const DEMO_LAYERS: Layer[] = [{ id: 'banner', label: 'Banner' }, { id: 'story', label: 'Story' }, { id: 'gatherings', label: 'Gatherings' }, { id: 'contact', label: 'Contact' }]

/** The block the inspector edits: its name, the controls the server derived from its contract, and starting values. */
type CanvasInspector = {
  title: string
  fields: readonly InspectorFieldView[]
  elsewhere: number
  initial: Readonly<Record<string, string | boolean>>
}

/** A phone-width screen, read live so a turned phone follows. */
const NARROW = '(max-width: 639px)'
const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches
function watchNarrow(change: () => void) {
  const query = typeof window !== 'undefined' ? window.matchMedia?.(NARROW) : undefined
  query?.addEventListener('change', change)
  return () => query?.removeEventListener('change', change)
}

export function CollabCanvas({ spaceId, inspector, document }: { spaceId?: string; inspector?: CanvasInspector; document?: CanvasDocumentView }) {
  const [doc] = useState(() => new Y.Doc())
  // On a phone the canvas opens on the Phone frame, so the page is drawn near its real size and the handles in it
  // keep their size; the other devices still fit, drawn smaller (PROG-E6C). The server draws Desktop; a device the
  // person picks always wins.
  const [picked, setDevice] = useState<BuilderDevice | null>(null)
  const narrow = useSyncExternalStore(watchNarrow, isNarrow, () => false)
  const device: BuilderDevice = picked ?? (narrow ? 'phone' : 'desktop')
  // The demo block is a real BlockNode: desktop is its `content`, tablet and phone its sparse `responsive` bags
  // (the stored form), so what the inspector edits is what a document would hold.
  const [demoNode, setDemoNode] = useState<BlockNode>(() => ({ nid: CANVAS_BLOCK_NID, type: 'photoHero', content: { ...(inspector?.initial ?? {}) } }))
  // A real document wins: the inspector then edits the node picked in the layer list, saved to the draft.
  const real = useCanvasDocument(document)
  const panel = real.selected ?? (inspector && !document ? { title: inspector.title, fields: inspector.fields, elsewhere: inspector.elsewhere, node: demoNode } : null)
  const node = panel?.node ?? demoNode
  // The inspector only draws string and toggle controls, so those are the values it reads and writes.
  const blockValues = nodeDeviceValues(node) as InspectorDeviceValues<Record<string, string | boolean>>
  // Vera (PROG-E8): the block counts as just created when every word field starts empty. Read once, at mount.
  const [fresh] = useState(() => !!inspector && inspector.fields.every((f) => (f.kind !== 'text' && f.kind !== 'textarea') || !inspector.initial[f.key]))
  const [layers, setLayers] = useState<Layer[]>(() => document?.layers ?? DEMO_LAYERS)
  const preview = panel && <BlockWords block={panel} device={device} />
  const [link, setLink] = useState<Link>(spaceId ? 'connecting' : 'local')
  const [peers, setPeers] = useState<PresenceState[]>([])
  const select = useRef<(nid: string | null) => void>(() => {})

  useEffect(() => {
    if (!spaceId) return
    let cancelled = false
    let close: (() => void) | null = null
    void (async () => {
      const [{ connectEditor }, { presenceSelf }, { createClient }] = await Promise.all([
        import('@/lib/editor-crdt/provider'),
        import('@/lib/editor-crdt/awareness'),
        import('@/lib/supabase/client'),
      ])
      if (cancelled) return
      const client = createClient()
      const self = presenceSelf(await client.auth.getUser().then((r) => r.data.user, () => null))
      if (cancelled) return
      const joined = connectEditor({
        doc, kind: 'space', entityId: spaceId, client: client as never, onStatus: setLink,
        presence: self ? { self, onPeers: setPeers } : undefined,
      })
      if (!joined) { setLink('offline'); return }
      select.current = (nid) => joined.select(nid)
      close = () => joined.disconnect()
    })()
    return () => {
      cancelled = true
      select.current = () => {}
      close?.()
      setPeers([])
    }
  }, [doc, spaceId])

  // The people whose selection is the demo node: the frame has no stylesheet, so the outline is inline.
  const here = peers.filter((p) => p.selectedNid === CANVAS_NID)

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-meta text-muted">
        {link === 'local' ? 'Local document. Add ?space=<space id> to share it.' : link === 'live' ? 'Live: edits are shared with everyone on this Space.' : link === 'connecting' ? 'Connecting…' : 'Offline: edits stay on this page until it reconnects.'}
      </p>
      <EditorPresenceFaces peers={peers} />
      </div>
    <div className={panel ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]' : undefined}>
    <CanvasViewportShell surface="site" device={device} onDeviceChange={setDevice}>
      <div style={{ padding: 24, font: '16px/1.5 system-ui, sans-serif' }}>
        <div
          data-presence-nid={CANVAS_NID}
          onFocus={() => select.current(CANVAS_NID)}
          onBlur={() => select.current(null)}
          style={here.length ? { position: 'relative', outline: `2px solid ${here[0].color}`, outlineOffset: 4 } : undefined}
        >
          {here.length > 0 && (
            <span aria-hidden="true" style={{ position: 'absolute', top: -22, left: 0, font: '12px/1.4 system-ui, sans-serif', color: here[0].color }}>
              {here.map((p) => p.name.trim() || 'Collaborator').join(', ')}
            </span>
          )}
          <CollabTextEditor doc={doc} nid={CANVAS_NID} field="body" seed={SEED} label="Page text" />
        </div>
        {document && real.tree ? (
          // A real page: every block, as the page holds it; the selected one carries its spacing handles (PROG-E6E).
          <div data-inspector-preview={real.selectedId ?? ''} style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid currentColor' }}>
            <CanvasPagePreview
              tree={real.tree}
              blocks={real.blocks}
              device={device}
              selectedId={real.selectedId}
              onSelect={real.select}
              renderSelected={(words) => (real.selected ? <SpacingHandles style={real.selected.node.style} onChange={real.space} readOnly={!document.canSave}>{words}</SpacingHandles> : words)}
            />
          </div>
        ) : panel && (
          <div data-inspector-preview={node.nid} style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid currentColor' }}>
            {preview}
          </div>
        )}
      </div>
    </CanvasViewportShell>
    {panel && (
      <div className="min-w-0">
      {document && <CanvasDocumentStatus document={document} save={real.save} problem={real.problem} />}
      {document && (
        <BlockActions
          title={real.layers.find((layer) => layer.id === real.selectedId)?.label ?? real.selected?.title ?? null}
          hidden={real.selectedHidden}
          off={!document.canSave ? 'This page is read only here, so its blocks cannot change.' : real.save === 'conflict' ? 'Reload to change blocks: this page was changed somewhere else.' : null}
          undoLabel={real.undoLabel}
          onDuplicate={real.duplicate}
          onToggleHidden={real.toggleHidden}
          onRemove={real.remove}
          onUndo={real.undo}
        />
      )}
      {panel.fields.length === 0 ? (
        <p className="text-body-sm text-muted">{panel.title} has no fields this inspector can edit yet. Pick another layer below.</p>
      ) : (
      <ResponsiveInspector
        key={node.nid}
        title={panel.title}
        fields={panel.fields}
        elsewhere={panel.elsewhere}
        device={device}
        values={blockValues}
        onChange={(next) => (document ? real.edit(next) : setDemoNode((cur) => withDeviceValues(cur, next as InspectorDeviceValues<Record<string, unknown>>)))}
      />
      )}
      {inspector && !document && <VeraBlockCoach title={inspector.title} values={blockValues.desktop ?? {}} fresh={fresh} spaceId={spaceId} />}
      </div>
    )}
    </div>
    <div className="mt-4">
      <LayerList layers={layers} onChange={setLayers} selectedId={document ? real.selectedId : undefined} onSelect={document ? real.select : undefined} tree={document ? real.tree : undefined} onMove={document ? real.move : undefined} onRow={document?.canSave ? real.row : undefined} />
      {document && (
        <p className="mt-2 text-meta text-muted">
          Edit picks the block the inspector shows. {!real.tree ? 'Moving a layer here is not saved yet.' : document.canSave ? 'A move is saved to the draft.' : 'A move here is not saved: this page is read only.'}
        </p>
      )}
    </div>
    {document && real.inserter && (
      <div className="mt-4">
        <BlockInserter
          inserter={real.inserter}
          under={real.selected?.title ?? null}
          off={!document.canSave ? 'This page is read only here, so nothing can be added.' : real.save === 'conflict' ? 'Reload to add a block: this page was changed somewhere else.' : null}
          onInsert={real.insert}
        />
      </div>
    )}
    </>
  )
}
