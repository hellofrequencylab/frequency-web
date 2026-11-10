import { describe, it, expect } from 'vitest'
import { upgradeLayout } from '../entity-blocks/node-tree'
import type { EditorChannelLike, EditorClientLike } from './provider'
import { openEditorSession } from './session'

const ID = '0b6a3c1e-6b7e-4c1e-9a53-1d2f3a4b5c6d'
type Handler = (m: { payload?: unknown }) => void

class Chan implements EditorChannelLike {
  handlers = new Map<string, Handler>()
  statusCb: ((s: string) => void) | null = null
  constructor(private room: Chan[]) { room.push(this) }
  on(_t: 'broadcast', f: { event: string }, cb: Handler) { this.handlers.set(f.event, cb); return this }
  subscribe(cb: (s: string) => void) { this.statusCb = cb; queueMicrotask(() => cb('SUBSCRIBED')); return this }
  async send(m: { event: string; payload: unknown }) {
    for (const p of this.room) if (p !== this) p.handlers.get(m.event)?.({ payload: m.payload })
    return 'ok'
  }
}
const world = () => {
  const room: Chan[] = []
  const client: EditorClientLike = { channel: () => new Chan(room), removeChannel: async () => {} }
  return client
}
const lay = (title: string) => upgradeLayout({ rows: [{ id: 'r1', columns: 1, title, cells: [['about']] }] })!
const tick = () => new Promise((r) => setTimeout(r, 20))

describe('editor session', () => {
  it('refuses an id with no topic', () => {
    expect(openEditorSession({ kind: 'space', entityId: 'nope', client: world(), initial: lay('a'), onRemote: () => {}, seedWaitMs: 0 })).toBeNull()
  })
  it('a second tab joins the first tab\'s state instead of doubling the page, and hears its edits', async () => {
    const client = world()
    const gotA: unknown[] = []
    const gotB: unknown[] = []
    const a = openEditorSession({ kind: 'space', entityId: ID, client, initial: lay('one'), onRemote: (t) => gotA.push(t), seedWaitMs: 0 })!
    await tick()
    const b = openEditorSession({ kind: 'space', entityId: ID, client, initial: lay('one'), onRemote: (t) => gotB.push(t), seedWaitMs: 200 })!
    await tick()
    expect(gotB.length).toBeGreaterThan(0)
    const last = gotB[gotB.length - 1] as { rows: { id: string }[] }
    expect(last.rows.map((r) => r.id)).toEqual(['r1'])
    a.push(lay('two'))
    await tick()
    const after = gotB[gotB.length - 1] as { rows: { title?: string }[] }
    expect(after.rows[0].title).toBe('two')
    a.close(); b.close()
  })
  it('does not echo its own push back as a remote change', async () => {
    const got: unknown[] = []
    const s = openEditorSession({ kind: 'space', entityId: ID, client: world(), initial: lay('one'), onRemote: (t) => got.push(t), seedWaitMs: 0 })!
    await tick()
    s.push(lay('two'))
    await tick()
    expect(got).toEqual([])
    s.close()
  })
})
