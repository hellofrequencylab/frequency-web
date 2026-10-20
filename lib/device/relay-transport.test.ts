import { describe, expect, it, vi } from 'vitest'
import { RpcClient } from './client'
import { openRelayTransport, relayDeviceOnline, type RelayChannelLike, type RelayClientLike } from './relay-transport'

const ID = '0f8e2b7a-1c3d-4e5f-8a9b-0c1d2e3f4a5b'

type Handler = (message: { payload?: unknown }) => void

function fakeClient(opts: { status?: string; err?: Error; present?: boolean } = {}) {
  const broadcast = new Map<string, Handler>()
  let onSync: (() => void) | null = null
  let onStatus: ((s: string, err?: Error) => void) | null = null
  const state: Record<string, unknown> = opts.present === false ? {} : { [ID]: [{ online: true }] }
  const sent: { event: string; payload: unknown }[] = []
  const channel = {
    on(type: string, filter: { event: string }, cb: Handler & (() => void)) {
      if (type === 'broadcast') broadcast.set(filter.event, cb)
      else onSync = cb
      return channel
    },
    subscribe(cb: (s: string, err?: Error) => void) {
      onStatus = cb
      queueMicrotask(() => cb(opts.status ?? 'SUBSCRIBED', opts.err))
      return channel
    },
    async send(m: { type: 'broadcast'; event: string; payload: unknown }) {
      sent.push({ event: m.event, payload: m.payload })
      return 'ok'
    },
    presenceState: () => state,
  } as unknown as RelayChannelLike
  const client = {
    realtime: { setAuth: vi.fn(async () => undefined) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  } satisfies RelayClientLike
  return {
    client,
    sent,
    deliver: (event: string, line: string) => broadcast.get(event)?.({ payload: { line } }),
    leave: () => {
      delete state[ID]
      onSync?.()
    },
    status: (s: string) => onStatus?.(s),
  }
}

describe('openRelayTransport', () => {
  it('joins the private device channel with the member session', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    expect(t.kind).toBe('relay')
    expect(f.client.realtime.setAuth).toHaveBeenCalled()
    expect(f.client.channel).toHaveBeenCalledWith(`device:${ID}`, expect.objectContaining({ config: expect.objectContaining({ private: true }) }))
  })

  it('sends each request line as a broadcast rpc without its newline', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    await t.write('rpc {"id":1,"cmd":"system.status","args":{}}\n')
    expect(f.sent).toEqual([{ event: 'rpc', payload: { line: 'rpc {"id":1,"cmd":"system.status","args":{}}' } }])
  })

  it('refuses raw CLI lines', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    await expect(t.write('display start\n')).rejects.toThrow(/Only commands/)
    expect(f.sent).toEqual([])
  })

  it('hands reply and evt lines to onText with a newline', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    const got: string[] = []
    t.onText((s) => got.push(s))
    f.deliver('reply', '@rpc {"id":1,"ok":true,"data":{}}')
    f.deliver('evt', '@evt {"evt":"button","data":{}}\n')
    expect(got).toEqual(['@rpc {"id":1,"ok":true,"data":{}}\n', '@evt {"evt":"button","data":{}}\n'])
  })

  it('runs the RpcClient end to end', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    const rpc = new RpcClient(t)
    const pending = rpc.call('system.status')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    const line = (f.sent[0].payload as { line: string }).line
    const id = JSON.parse(line.slice(4)).id as number
    f.deliver('reply', `@rpc {"id":${id},"ok":true,"data":{"fw":"1"}}`)
    await expect(pending).resolves.toEqual({ fw: '1' })
  })

  it('refuses when the board is not online', async () => {
    const f = fakeClient({ present: false })
    await expect(openRelayTransport(ID, { client: f.client, timeoutMs: 10 })).rejects.toThrow(/not online/)
    expect(f.client.removeChannel).toHaveBeenCalled()
  })

  it('refuses plainly when the policy denies the join', async () => {
    const f = fakeClient({ status: 'CHANNEL_ERROR', err: new Error('Unauthorized: You do not have permissions to read from this Channel topic') })
    await expect(openRelayTransport(ID, { client: f.client })).rejects.toThrow(/cannot reach that CyberUnicorn/)
  })

  it('closes when the board leaves presence past the grace period', async () => {
    vi.useFakeTimers()
    try {
      const f = fakeClient()
      const t = await openRelayTransport(ID, { client: f.client, offlineGraceMs: 1000 })
      const reasons: string[] = []
      t.onClose((r) => reasons.push(r))
      f.leave()
      expect(reasons).toEqual([])
      await vi.advanceTimersByTimeAsync(1000)
      expect(reasons).toEqual(['The CyberUnicorn went offline.'])
      await expect(t.write('rpc {}\n')).rejects.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes when the channel errors', async () => {
    const f = fakeClient()
    const t = await openRelayTransport(ID, { client: f.client })
    const reasons: string[] = []
    t.onClose((r) => reasons.push(r))
    f.status('CHANNEL_ERROR')
    expect(reasons).toHaveLength(1)
  })

  it('rejects an id that is not a device id', async () => {
    const f = fakeClient()
    await expect(openRelayTransport('device:nope', { client: f.client })).rejects.toThrow(/not a CyberUnicorn id/)
  })
})

describe('relayDeviceOnline', () => {
  it('reads presence and leaves the channel', async () => {
    const f = fakeClient()
    await expect(relayDeviceOnline(ID, { client: f.client })).resolves.toBe(true)
    expect(f.client.removeChannel).toHaveBeenCalled()
  })

  it('is false when the board is absent', async () => {
    const f = fakeClient({ present: false })
    await expect(relayDeviceOnline(ID, { client: f.client, timeoutMs: 10 })).resolves.toBe(false)
  })
})
