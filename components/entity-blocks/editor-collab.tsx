'use client'

import { useEffect, useRef } from 'react'
import { useNodeLayout } from './node-layout-store'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'

// LIVE COLLABORATION MOUNT (E0 wiring). Renders nothing. While the owner's page builder is open it
// joins the entity's editing channel and keeps the node store and a shared Y.Doc in step: the store's
// edits are pushed onto the doc, a peer's edits come back through the snapshot boundary (sanitized)
// and land as a store edit. The store's own debounced save then persists them, so every open tab
// writes the same draft; that is idempotent, not a conflict.
//
// The Yjs code is imported on demand, inside the effect, so it is a separate chunk that only the
// editor ever loads. This is the first allowlisted importer (scripts/editor-crdt-importers.txt): the
// file is reached only from NodePageBuilder, which mounts it only past the owner guard, and only when
// the rail data carries a collabEntityId (EDITOR_COLLAB on the server).

type Session = { push(layout: NodeLayout): void; close(): void }

export function EditorCollab({ kind, entityId }: { kind: 'space'; entityId: string }) {
  const store = useNodeLayout()
  const edit = store?.edit
  const layout = store?.layout ?? null
  const seeded = !!store?.seeded
  const session = useRef<Session | null>(null)
  const latest = useRef<NodeLayout | null>(null)
  // The tree a peer last handed us: pushing it straight back would be a pointless round trip.
  const fromPeer = useRef<NodeLayout | null>(null)

  useEffect(() => {
    latest.current = layout
  }, [layout])

  useEffect(() => {
    if (!seeded || !edit) return
    let cancelled = false
    void (async () => {
      const [{ openEditorSession }, { createClient }] = await Promise.all([
        import('@/lib/editor-crdt/session'),
        import('@/lib/supabase/client'),
      ])
      if (cancelled || !latest.current) return
      const s = openEditorSession({
        kind,
        entityId,
        client: createClient() as never,
        initial: latest.current,
        onRemote: (tree) => {
          fromPeer.current = tree
          edit(() => tree)
        },
      })
      if (!s) return
      if (cancelled) {
        s.close()
        return
      }
      session.current = s
    })()
    return () => {
      cancelled = true
      session.current?.close()
      session.current = null
    }
  }, [seeded, edit, kind, entityId])

  useEffect(() => {
    if (!layout || layout === fromPeer.current) return
    session.current?.push(layout)
  }, [layout])

  return null
}
