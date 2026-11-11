'use client'

import { useEffect, useRef } from 'react'
import { useNodeLayout } from './node-layout-store'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { PresenceState } from '@/lib/editor-crdt/awareness'

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
//
// Presence (BLD-401): the session also carries who is here and which node each person has selected, on the
// same channel and never in the doc. `onPeers` hears the others (the builder draws faces and selection
// outlines from it); this tab's own selection follows the store's selectedNid.

type Session = { push(layout: NodeLayout): void; select(nid: string | null): void; close(): void }

export function EditorCollab({ kind, entityId, onPeers }: {
  kind: 'space'
  entityId: string
  /** The other people in this editor, from the provider's peer book. Cleared on unmount. */
  onPeers?: (peers: PresenceState[]) => void
}) {
  const store = useNodeLayout()
  const edit = store?.edit
  const layout = store?.layout ?? null
  const seeded = !!store?.seeded
  const selectedNid = store?.selectedNid ?? null
  const selected = useRef<string | null>(selectedNid)
  const peersTo = useRef(onPeers)
  const session = useRef<Session | null>(null)
  const latest = useRef<NodeLayout | null>(null)
  // The tree a peer last handed us: pushing it straight back would be a pointless round trip.
  const fromPeer = useRef<NodeLayout | null>(null)

  useEffect(() => {
    latest.current = layout
  }, [layout])
  useEffect(() => {
    peersTo.current = onPeers
  }, [onPeers])

  useEffect(() => {
    if (!seeded || !edit) return
    let cancelled = false
    void (async () => {
      const [{ openEditorSession }, { presenceSelf }, { createClient }] = await Promise.all([
        import('@/lib/editor-crdt/session'),
        import('@/lib/editor-crdt/awareness'),
        import('@/lib/supabase/client'),
      ])
      if (cancelled || !latest.current) return
      const client = createClient()
      // Who this tab is. No signed-in user (cannot happen past the owner guard) means no faces, not no session.
      const user = await client.auth.getUser().then((r) => r.data.user, () => null)
      const self = presenceSelf(user)
      if (cancelled || !latest.current) return
      const s = openEditorSession({
        kind,
        entityId,
        client: client as never,
        initial: latest.current,
        onRemote: (tree) => {
          fromPeer.current = tree
          edit(() => tree)
        },
        presence: self ? { self: { ...self, selectedNid: selected.current }, onPeers: (peers) => peersTo.current?.(peers) } : undefined,
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
      peersTo.current?.([])
    }
  }, [seeded, edit, kind, entityId])

  useEffect(() => {
    if (!layout || layout === fromPeer.current) return
    session.current?.push(layout)
  }, [layout])

  useEffect(() => {
    selected.current = selectedNid
    session.current?.select(selectedNid)
  }, [selectedNid])

  return null
}
