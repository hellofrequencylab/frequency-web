import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { upgradeLayout } from '../entity-blocks/node-tree'
import { toYDoc, serializeLayout, editLocal } from './node-ydoc'
import { editorTopic } from './channel'
import { connectEditor, type EditorChannelLike, type EditorClientLike } from './provider'

const ID = '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'

type Handler = (m: { payload?: unknown }) => void

/** An in-memory room: channels joined to one topic hear each other's broadcasts, not their own. */
class Room {
  members: FakeChannel[] = []
}
class FakeChannel implements EditorChannelLike {
  handlers = new Map<string, Handler>()
  statusCb: ((s: string) => void) | null = null
  sent: { event: string; payload: unknown }[] = []
  online = false
  constructor(private room: Room) {
    room.members.push(this)
  }
  on(_t: 'broadcast', f: { event: string }, cb: Handler) {
    this.handlers.set(f.event, cb)
    return this
  }
  subscribe(cb: (s: string) => void) {
    this.statusCb = cb
    return this
  }
  async send(m: { event: string; payload: unknown }) {
    this.sent.push({ event: m.event, payload: m.payload })
    if (!this.online) return 'error'
    for (const peer of this.room.members) if (peer !== this && peer.online) peer.handlers.get(m.event)?.({ payload: m.payload })
    return 'ok'
  }
  set(status: string) {
    this.online = status === 'SUBSCRIBED'
    this.statusCb?.(status)
  }
}
function clientFor(room: Room, out: FakeChannel[]): EditorClientLike {
  return {
    channel: () => {
      const c = new FakeChannel(room)
      out.push(c)
      return c
    },
    removeChannel: async () => {},
  }
}

const layout = () => upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['about']] }] })!

describe('editor provider', () => {
  it('refuses a kind or id that has no topic', () => {
    const doc = new Y.Doc()
    const link = connectEditor({ doc, kind: 'space', entityId: "x'; drop", client: clientFor(new Room(), []) })
    expect(link).toBeNull()
    expect(editorTopic('space', ID)).toBe(`editor:space:${ID}`)
  })

  it('carries a live edit to a peer and a late joiner catches up through sync', async () => {
    const room = new Room()
    const chans: FakeChannel[] = []
    const a = toYDoc(layout())
    const b = new Y.Doc()
    connectEditor({ doc: a, kind: 'site', entityId: ID, client: clientFor(room, chans) })
    chans[0].set('SUBSCRIBED')
    editLocal(a, root => root.get('meta') instanceof Y.Map && (root.get('meta') as Y.Map<unknown>).set('template', 'edited'))
    // b joins late: its sync request makes a send its whole document.
    connectEditor({ doc: b, kind: 'site', entityId: ID, client: clientFor(room, chans) })
    chans[1].set('SUBSCRIBED')
    await Promise.resolve()
    expect(serializeLayout(b).rows[0].cells[0][0].type).toBe('about')
    expect(serializeLayout(b).template).toBe('edited')
  })

  it('replays edits made while offline once the channel is back', async () => {
    const room = new Room()
    const chans: FakeChannel[] = []
    const a = toYDoc(layout())
    const b = new Y.Doc()
    connectEditor({ doc: a, kind: 'space', entityId: ID, client: clientFor(room, chans) })
    connectEditor({ doc: b, kind: 'space', entityId: ID, client: clientFor(room, chans) })
    chans[0].set('SUBSCRIBED')
    chans[1].set('SUBSCRIBED')
    chans[0].set('CLOSED')
    editLocal(a, root => (root.get('meta') as Y.Map<unknown>).set('template', 'offline-edit'))
    expect(serializeLayout(b).template).not.toBe('offline-edit')
    chans[0].set('SUBSCRIBED')
    await Promise.resolve()
    expect(serializeLayout(b).template).toBe('offline-edit')
  })

  it('does not echo a remote change back and drops a malformed payload', async () => {
    const room = new Room()
    const chans: FakeChannel[] = []
    const a = toYDoc(layout())
    connectEditor({ doc: a, kind: 'site', entityId: ID, client: clientFor(room, chans) })
    chans[0].set('SUBSCRIBED')
    const before = chans[0].sent.length
    chans[0].handlers.get('update')?.({ payload: { v: 1, u: 'not base64!!' } })
    chans[0].handlers.get('update')?.({ payload: { v: 1, u: 'AAAA' } })
    expect(chans[0].sent.length).toBe(before)
    expect(serializeLayout(a).rows).toHaveLength(1)
  })

  it('stops sending after disconnect', () => {
    const room = new Room()
    const chans: FakeChannel[] = []
    const a = toYDoc(layout())
    const link = connectEditor({ doc: a, kind: 'site', entityId: ID, client: clientFor(room, chans) })!
    chans[0].set('SUBSCRIBED')
    link.disconnect()
    const n = chans[0].sent.length
    editLocal(a, root => (root.get('meta') as Y.Map<unknown>).set('template', 'late'))
    expect(chans[0].sent.length).toBe(n)
  })
})
