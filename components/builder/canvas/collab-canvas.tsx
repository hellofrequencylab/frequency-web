'use client'

// THE CANVAS WITH A SHARED TEXT FIELD (PROG-E4B). The viewport shell (same-origin iframe, device widths) holding a
// CollabTextEditor bound to a Y.Doc. The doc here is LOCAL to the page: the live transport (the editor-crdt provider)
// joins a doc the same way for a real entity, and wiring a page to its channel is the next slice. Until then this
// proves the composition end to end on one route. Editor only: allowlisted for check:editor-crdt-importers, mounted
// only by the staff-gated, flag-gated /pages/canvas.

import { useState } from 'react'
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

export function CollabCanvas() {
  const [doc] = useState(() => new Y.Doc())
  const [device, setDevice] = useState<BuilderDevice>('desktop')
  return (
    <CanvasViewportShell surface="site" device={device} onDeviceChange={setDevice}>
      <div style={{ padding: 24, font: '16px/1.5 system-ui, sans-serif' }}>
        <CollabTextEditor doc={doc} nid="canvas-demo" field="body" seed={SEED} label="Page text" />
      </div>
    </CanvasViewportShell>
  )
}
