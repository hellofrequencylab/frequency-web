import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { PRESENCE_TTL_MS, createPeerBook, type PresenceState } from './awareness'
import { connectEditor, type EditorChannelLike, type EditorClientLike } from './provider'
import { toYDoc } from './node-ydoc'
import { upgradeLayout } from '../entity-blocks/node-tree'

const ID = '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'
type Handler = (m: { payload?: unknown }) => void
class Room {
  members: Chan[] = []
}
class Chan implements EditorChannelLike {
  handlers = new Map<string, Handler>()
  statusCb: ((s: string) => void) | null = null
  online = false
  sent: { event: string; payload: unknown }[] = []
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
    this.sent.push(m)
    for (const p of this.room.members) if (p !== this && p.online) p.handlers.get(m.event)?.({ payload: m.payload })
    return 'ok'
  }
  up() {
    this.online = true
    this.statusCb?.('SUBSCRIBED')
  }
}
const clientFor = (room: Room, out: Chan[]): EditorClientLike => ({
  channel: () => (out.push(new Chan(room)), out[out.length - 1]),
  removeChannel: async () => {},
})
const me = (id: string, nid: string | null = null): PresenceState => ({ userId: id, name: id, color: '#112233', selectedNid: nid })
const doc = () => toYDoc(upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['about']] }] })!)

afterEach(() => vi.useRealTimers())

describe('peer book', () => {
  it('hears others, never itself, and reports only real changes', () => {
    const b = createPeerBook()
    expect(b.hear(me('a'), 0, 'me')).toBe(true)
    expect(b.hear(me('a'), 1, 'me')).toBe(false)
    expect(b.hear(me('a', 'n0abcdef'), 2, 'me')).toBe(true)
    expect(b.hear(me('me'), 3, 'me')).toBe(false)
    expect(b.hear({ nope: 1 }, 3, 'me')).toBe(false)
    expect(b.list().map((p) => p.userId)).toEqual(['a'])
  })
  it('drops a peer past the TTL, keeps a fresh one, and handles leave', () => {
    const b = createPeerBook()
    b.hear(me('old'), 0, 'me')
    b.hear(me('new'), PRESENCE_TTL_MS - 1, 'me')
    expect(b.prune(PRESENCE_TTL_MS)).toBe(true)
    expect(b.list().map((p) => p.userId)).toEqual(['new'])
    expect(b.leave('new')).toBe(true)
    expect(b.leave('new')).toBe(false)
  })
  it('caps the room so a flood cannot grow it without bound', () => {
    const b = createPeerBook()
    for (let i = 0; i < 80; i++) b.hear(me(`u${i}`), 0, 'me')
    expect(b.list().length).toBe(50)
  })
})

describe('presence over the editor channel', () => {
  it('shows each tab to the other, follows a selection, and says goodbye; the document is untouched', async () => {
    vi.useFakeTimers()
    const room = new Room()
    const chans: Chan[] = []
    const seenByA: PresenceState[][] = []
    const dA = doc()
    const dB = doc()
    const a = connectEditor({ doc: dA, kind: 'space', entityId: ID, client: clientFor(room, chans), presence: { self: me('a'), onPeers: (p) => seenByA.push(p) } })!
    const b = connectEditor({ doc: dB, kind: 'space', entityId: ID, client: clientFor(room, chans), presence: { self: me('b'), onPeers: () => {} } })!
    chans[0].up()
    chans[1].up()
    await vi.advanceTimersByTimeAsync(0)
    expect(seenByA.at(-1)?.map((p) => p.userId)).toEqual(['b'])
    const before = JSON.stringify(Y.encodeStateAsUpdate(dB))
    b.select('n0abcdef')
    expect(seenByA.at(-1)?.[0].selectedNid).toBe('n0abcdef')
    expect(JSON.stringify(Y.encodeStateAsUpdate(dB))).toBe(before)
    b.disconnect()
    expect(seenByA.at(-1)).toEqual([])
    a.disconnect()
  })
  it('without a presence option nothing presence-shaped is sent', async () => {
    const room = new Room()
    const chans: Chan[] = []
    const l = connectEditor({ doc: doc(), kind: 'space', entityId: ID, client: clientFor(room, chans) })!
    chans[0].up()
    l.select('n0abcdef')
    l.disconnect()
    expect(chans[0].sent.some((m) => m.event === 'presence' || m.event === 'leave')).toBe(false)
  })
})
