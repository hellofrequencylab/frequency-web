// EDITOR SESSION — E0 wiring. One open editing session: a Y.Doc, its channel link, and the two
// bridges the page builder needs (its plain-tree store <-> the shared doc). Editor only: no visitor
// bundle may import this (check:editor-crdt-importers).
//
//   • push(layout): the store's next tree is written onto the doc as the smallest change.
//   • onRemote(tree): a peer's change arrived; the doc is read through the snapshot boundary
//     (sanitized) and handed over. A doc that sanitizes to nothing is ignored.
//   • Joining: the doc starts EMPTY and asks the room for its state. Only if nobody answers within a
//     short, jittered wait is it seeded from `initial`. Two tabs that each seeded their own copy of
//     the same page would merge into a doubled page (independent Yjs histories); waiting for a peer
//     avoids that. Two tabs that still seed in the same instant are repaired by the next push, which
//     drops a row id it sees twice (reconcileDoc).

import * as Y from 'yjs'
import type { EntityKind } from '../entity-blocks/registry'
import type { NodeLayout } from '../entity-blocks/node-tree'
import { reconcileDoc, REMOTE_ORIGIN } from './node-ydoc'
import { snapshotForStorage } from './snapshot'
import { connectEditor, type EditorClientLike } from './provider'
import type { PresenceState } from './awareness'

type SessionStatus = 'connecting' | 'live' | 'offline'

interface SessionOptions {
  kind: EntityKind
  entityId: string
  client: EditorClientLike
  /** The tree this tab loaded; used only when no peer answers. */
  initial: NodeLayout
  onRemote: (tree: NodeLayout) => void
  onStatus?: (status: SessionStatus) => void
  /** Wait for a peer before seeding. Tests pass 0. */
  seedWaitMs?: number
  /** Faces and selections (BLD-401), handed straight to the provider. Never written to the doc. */
  presence?: { self: PresenceState; onPeers: (peers: PresenceState[]) => void }
}

interface EditorSession {
  push(layout: NodeLayout): void
  /** Tell the room which node this tab has selected (null clears). No-op without `presence`. */
  select(nid: string | null): void
  close(): void
}

const hasStructure = (doc: Y.Doc) => doc.getMap('layout').get('rows') instanceof Y.Array

/** Open a session, or null when the entity has no channel topic. */
export function openEditorSession({ kind, entityId, client, initial, onRemote, onStatus, seedWaitMs, presence }: SessionOptions): EditorSession | null {
  const doc = new Y.Doc()
  let closed = false
  let seeded = false
  let latest = initial

  const link = connectEditor({ doc, kind, entityId, client, onStatus, presence })
  if (!link) return null

  const seed = () => {
    if (closed || seeded || hasStructure(doc)) return
    seeded = true
    reconcileDoc(doc, latest)
  }
  const wait = seedWaitMs ?? 800 + Math.random() * 700
  const timer = setTimeout(seed, wait)

  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE_ORIGIN || closed) return
    const snap = snapshotForStorage(doc, kind)
    if (snap) onRemote(snap.tree)
  }
  doc.on('update', onUpdate)

  return {
    push(layout) {
      latest = layout
      // Before the room has answered there is nothing to write onto: the seed will carry `latest`.
      if (!hasStructure(doc)) return
      reconcileDoc(doc, layout)
    },
    select(nid) {
      if (!closed) link.select(nid)
    },
    close() {
      closed = true
      clearTimeout(timer)
      doc.off('update', onUpdate)
      link.disconnect()
      doc.destroy()
    },
  }
}
