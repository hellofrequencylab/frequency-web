'use client'

// THE CANVAS WITH A SHARED TEXT FIELD (PROG-E4B, PROG-E4C). The viewport shell (same-origin iframe, device widths) holding a
// CollabTextEditor bound to a Y.Doc. With a spaceId the doc joins that Space's private editing channel
// (the same `editor:space:<id>` room the Space page builder uses, authorized by the same policy), so two browsers
// converge on the text; without one it stays local. The text lives in the doc's own `text` map, so the page
// builder's layout is untouched, and nothing here is persisted. Editor only: allowlisted for check:editor-crdt-importers, mounted
// only by the staff-gated, flag-gated /pages/canvas.
//
// Presence (BLD-401): on a shared Space the link also carries who is here (faces above the canvas) and which node
// each person is in (an outline on that node inside the frame). It rides the channel, never the doc.

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { BuilderDevice } from '@/lib/builder/state'
import { CanvasViewportShell } from './canvas-viewport-shell'
import { CollabTextEditor } from './collab-text-editor'
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

export function CollabCanvas({ spaceId }: { spaceId?: string }) {
  const [doc] = useState(() => new Y.Doc())
  const [device, setDevice] = useState<BuilderDevice>('desktop')
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
      </div>
    </CanvasViewportShell>
    </>
  )
}
