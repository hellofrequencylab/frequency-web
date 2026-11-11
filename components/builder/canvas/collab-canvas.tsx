'use client'

// THE CANVAS WITH A SHARED TEXT FIELD (PROG-E4B, PROG-E4C). The viewport shell (same-origin iframe, device widths) holding a
// CollabTextEditor bound to a Y.Doc. With a spaceId the doc joins that Space's private editing channel
// (the same `editor:space:<id>` room the Space page builder uses, authorized by the same policy), so two browsers
// converge on the text; without one it stays local. The text lives in the doc's own `text` map, so the page
// builder's layout is untouched, and nothing here is persisted. Editor only: allowlisted for check:editor-crdt-importers, mounted
// only by the staff-gated, flag-gated /pages/canvas.

import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { BuilderDevice } from '@/lib/builder/state'
import { CanvasViewportShell } from './canvas-viewport-shell'
import { CollabTextEditor } from './collab-text-editor'

const SEED = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Write here' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'This text lives in a shared document. Edit it and the change is a CRDT update.' }] },
  ],
}

type Link = 'local' | 'connecting' | 'live' | 'offline'

export function CollabCanvas({ spaceId }: { spaceId?: string }) {
  const [doc] = useState(() => new Y.Doc())
  const [device, setDevice] = useState<BuilderDevice>('desktop')
  const [link, setLink] = useState<Link>(spaceId ? 'connecting' : 'local')

  useEffect(() => {
    if (!spaceId) return
    let cancelled = false
    let close: (() => void) | null = null
    void (async () => {
      const [{ connectEditor }, { createClient }] = await Promise.all([
        import('@/lib/editor-crdt/provider'),
        import('@/lib/supabase/client'),
      ])
      if (cancelled) return
      const joined = connectEditor({ doc, kind: 'space', entityId: spaceId, client: createClient() as never, onStatus: setLink })
      if (!joined) { setLink('offline'); return }
      close = () => joined.disconnect()
    })()
    return () => { cancelled = true; close?.() }
  }, [doc, spaceId])

  return (
    <>
      <p role="status" className="mb-2 text-meta text-muted">
        {link === 'local' ? 'Local document. Add ?space=<space id> to share it.' : link === 'live' ? 'Live: edits are shared with everyone on this Space.' : link === 'connecting' ? 'Connecting…' : 'Offline: edits stay on this page until it reconnects.'}
      </p>
    <CanvasViewportShell surface="site" device={device} onDeviceChange={setDevice}>
      <div style={{ padding: 24, font: '16px/1.5 system-ui, sans-serif' }}>
        <CollabTextEditor doc={doc} nid="canvas-demo" field="body" seed={SEED} label="Page text" />
      </div>
    </CanvasViewportShell>
    </>
  )
}
