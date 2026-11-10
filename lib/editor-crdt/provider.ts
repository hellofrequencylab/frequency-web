// BROWSER PROVIDER — E0 task 18. Connects one Y.Doc to the private Broadcast channel
// `editor:<kind>:<uuid>` (channel.ts names it, migration 20270346033000 authorizes the join).
//
//   • A local change is broadcast as an `update` envelope. A change that arrived from a peer is
//     tagged remote by applyRemote and is never echoed back.
//   • Every (re)subscribe does two things: it sends the whole document as an `update` (so edits made
//     while the socket was down reach the room; Yjs updates are idempotent) and it sends `sync` so
//     the peers answer with their whole document (so a late joiner or a returning tab catches up).
//   • An unusable or oversize payload from a peer is dropped, never thrown on (channel.decodeUpdate).
//
// A peer's content is untrusted: nothing here validates it. The snapshot boundary (snapshot.ts)
// runs sanitizeNodeLayout before anything is stored. Client-only; the editor bundle imports this,
// no visitor bundle may. The Supabase client is passed in, so this file imports none of it.

import type * as Y from 'yjs'
import type { EntityKind } from '../entity-blocks/registry'
import { editorTopic, encodeUpdate, decodeUpdate } from './channel'
import { applyRemote, encodeState, REMOTE_ORIGIN } from './node-ydoc'
import { createPeerBook, PRESENCE_BEAT_MS, type PresenceState } from './awareness'

/** The subset of a Supabase RealtimeChannel this provider touches (a test passes a fake). */
export interface EditorChannelLike {
  on(type: 'broadcast', filter: { event: string }, callback: (message: { payload?: unknown }) => void): EditorChannelLike
  subscribe(callback: (status: string, err?: Error) => void): unknown
  send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>
}

/** The subset of the browser Supabase client this provider touches. */
export interface EditorClientLike {
  channel(topic: string, opts: { config: Record<string, unknown> }): EditorChannelLike
  removeChannel(channel: EditorChannelLike): Promise<unknown>
}

type EditorLinkStatus = 'connecting' | 'live' | 'offline'

interface ConnectOptions {
  doc: Y.Doc
  kind: EntityKind
  entityId: string
  client: EditorClientLike
  onStatus?: (status: EditorLinkStatus) => void
  /** Optional faces and selections. Rides the same channel as its own `presence` event and is never
   *  written to the document (awareness.ts). `self` is who this tab is; `onPeers` hears the others. */
  presence?: { self: PresenceState; onPeers: (peers: PresenceState[]) => void; now?: () => number }
}

interface EditorLink {
  disconnect(): void
  /** Tell the room which node this tab has selected (null to clear). No-op without `presence`. */
  select(nid: string | null): void
}

/** Join the entity's editing channel. Returns null when kind or id cannot form a topic. */
export function connectEditor({ doc, kind, entityId, client, onStatus, presence }: ConnectOptions): EditorLink | null {
  const topic = editorTopic(kind, entityId)
  if (!topic) return null
  const channel = client.channel(topic, { config: { private: true, broadcast: { self: false } } })
  let live = false
  let closed = false

  const setStatus = (s: EditorLinkStatus) => onStatus?.(s)
  const sendState = () => {
    const env = encodeUpdate(encodeState(doc))
    if (env) void channel.send({ type: 'broadcast', event: 'update', payload: env }).catch(() => {})
  }

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN || !live || closed) return
    const env = encodeUpdate(update)
    if (env) void channel.send({ type: 'broadcast', event: 'update', payload: env }).catch(() => {})
  }
  doc.on('update', onDocUpdate)

  const clock = presence?.now ?? Date.now
  const book = createPeerBook()
  let me = presence?.self
  const sendPresence = () => {
    if (me && live && !closed) void channel.send({ type: 'broadcast', event: 'presence', payload: me }).catch(() => {})
  }
  const tell = () => presence?.onPeers(book.list())
  let timer: ReturnType<typeof setInterval> | null = null

  channel
    .on('broadcast', { event: 'update' }, ({ payload }) => {
      const bytes = decodeUpdate(payload)
      if (!bytes) return
      try {
        applyRemote(doc, bytes)
      } catch {
        // A malformed Yjs update that passed the envelope check: drop it, the doc is unchanged.
      }
    })
    .on('broadcast', { event: 'sync' }, () => {
      if (live) sendState()
      sendPresence()
    })
    .on('broadcast', { event: 'presence' }, ({ payload }) => {
      if (presence && me && book.hear(payload, clock(), me.userId)) tell()
    })
    .on('broadcast', { event: 'leave' }, ({ payload }) => {
      const id = (payload as { userId?: unknown } | undefined)?.userId
      if (presence && typeof id === 'string' && book.leave(id)) tell()
    })
    .subscribe(status => {
      if (closed) return
      if (status === 'SUBSCRIBED') {
        live = true
        setStatus('live')
        sendState()
        void channel.send({ type: 'broadcast', event: 'sync', payload: { v: 1 } }).catch(() => {})
        sendPresence()
        if (presence && !timer) {
          timer = setInterval(() => {
            if (book.prune(clock())) tell()
            sendPresence()
          }, PRESENCE_BEAT_MS)
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        live = false
        setStatus('offline')
      } else {
        setStatus('connecting')
      }
    })

  return {
    select(nid) {
      if (!me) return
      me = { ...me, selectedNid: nid }
      sendPresence()
    },
    disconnect() {
      if (me && live && !closed) void channel.send({ type: 'broadcast', event: 'leave', payload: { userId: me.userId } }).catch(() => {})
      if (timer) clearInterval(timer)
      closed = true
      live = false
      doc.off('update', onDocUpdate)
      void client.removeChannel(channel)
    },
  }
}
