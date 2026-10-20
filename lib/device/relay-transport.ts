// INTERNET transport for the browser (LIVE-1155, docs/LOYALTY.md section 8 "Internet relay";
// cyberpunkunicorn-os/apps/remote/PROTOCOL.md section 6). The browser and the CyberUnicorn are both
// clients of Supabase Realtime and meet on the private Broadcast channel `device:<id>` (the client
// library joins it as `realtime:device:<id>`, the topic the board joins). The same RpcClient
// (client.ts) runs over it unchanged:
//   • write(line)   broadcasts event `rpc` with {line: "rpc {...}"};
//   • the board answers `reply` {line: "@rpc ..."} and pushes `evt` {line: "@evt ..."}; each line goes
//     to onText with its newline back on, so the client's LineSplitter frames it like USB text;
//   • the board `track()`s presence under its own id, so presence says whether it is online.
// The join is authorized by the caller's member session (supabase.realtime.setAuth(), as
// components/reward-live.tsx does) against the realtime.messages policies of migration
// 20270346015500_device_relay.sql. The board enforces the command allow-list itself.
//
// Client-only. The Supabase client is imported lazily so a page that never opens the relay ships none
// of it.

import { Emitter, type Transport } from './transport'

/** The subset of a Supabase RealtimeChannel this transport touches (a test passes a fake). */
export interface RelayChannelLike {
  on(type: 'broadcast', filter: { event: string }, callback: (message: { payload?: unknown }) => void): RelayChannelLike
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): RelayChannelLike
  subscribe(callback: (status: string, err?: Error) => void): unknown
  send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<string>
  presenceState(): Record<string, unknown>
}

/** The subset of the browser Supabase client this transport touches. */
export interface RelayClientLike {
  realtime: { setAuth(token?: string | null): Promise<void> }
  channel(topic: string, opts: { config: Record<string, unknown> }): RelayChannelLike
  removeChannel(channel: RelayChannelLike): Promise<unknown>
}

interface RelayTransportOptions {
  /** What the console shows as connected. Default "Internet". */
  label?: string
  /** Refuse to open unless the board is online (its presence is on the channel). Default true. */
  requireOnline?: boolean
  /** How long to wait for the join and then for the board's presence. Default 8000 ms each. */
  timeoutMs?: number
  /** How long the board may be missing from presence before the link counts as dropped (a board
   *  reconnecting its socket leaves and rejoins). Default 10000 ms. */
  offlineGraceMs?: number
  /** Inject a client (tests). Default: the app's browser Supabase client. */
  client?: RelayClientLike
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const OFFLINE = 'The CyberUnicorn went offline.'
const NOT_ONLINE = 'The CyberUnicorn is not online. Turn on Internet remote on the board and check its Wi-Fi.'
const REFUSED = 'You cannot reach that CyberUnicorn over the internet. Its internet remote may be off on the site.'
const NO_CONNECTION = 'Could not reach the internet relay. Check your connection and try again.'

async function defaultClient(): Promise<RelayClientLike> {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient() as unknown as RelayClientLike
}

function lineOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const line = (payload as { line?: unknown }).line
  return typeof line === 'string' ? line.replace(/[\r\n]+$/, '') : null
}

interface Joined {
  client: RelayClientLike
  channel: RelayChannelLike
  text: Emitter<string>
  status: Emitter<{ status: string; err?: Error }>
  presence: Emitter<void>
}

/** Join `device:<id>` with the member session. Resolves once the channel is SUBSCRIBED. */
async function join(deviceId: string, opts: RelayTransportOptions): Promise<Joined> {
  const id = deviceId.trim().toLowerCase()
  if (!UUID.test(id)) throw new Error('That is not a CyberUnicorn id.')
  const client = opts.client ?? (await defaultClient())
  // Private channels authorize with the signed-in member's own access token.
  await client.realtime.setAuth()
  const text = new Emitter<string>()
  const status = new Emitter<{ status: string; err?: Error }>()
  const presence = new Emitter<void>()
  const channel = client.channel(`device:${id}`, {
    config: { private: true, broadcast: { self: false, ack: true }, presence: { enabled: true } },
  })
  const deliver = ({ payload }: { payload?: unknown }) => {
    const line = lineOf(payload)
    if (line) text.emit(line + '\n')
  }
  channel.on('broadcast', { event: 'reply' }, deliver)
  channel.on('broadcast', { event: 'evt' }, deliver)
  channel.on('presence', { event: 'sync' }, () => presence.emit())

  const timeoutMs = opts.timeoutMs ?? 8000
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error(NO_CONNECTION)), timeoutMs)
    function finish(err?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        void client.removeChannel(channel).catch(() => undefined)
        reject(err)
      } else resolve()
    }
    channel.subscribe((s, err) => {
      status.emit({ status: s, err })
      if (s === 'SUBSCRIBED') finish()
      else if (s === 'CHANNEL_ERROR') finish(new Error(/unauthori[sz]ed|permission/i.test(err?.message ?? '') ? REFUSED : NO_CONNECTION))
      else if (s === 'TIMED_OUT' || s === 'CLOSED') finish(new Error(NO_CONNECTION))
    })
  })
  return { client, channel, text, status, presence }
}

function boardPresent(channel: RelayChannelLike, deviceId: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(channel.presenceState(), deviceId.trim().toLowerCase())
  } catch {
    return false
  }
}

/** Wait until the board's presence shows up, or `timeoutMs` passes. */
function waitForBoard(j: Joined, deviceId: string, timeoutMs: number): Promise<boolean> {
  if (boardPresent(j.channel, deviceId)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off()
      resolve(boardPresent(j.channel, deviceId))
    }, timeoutMs)
    const off = j.presence.on(() => {
      if (!boardPresent(j.channel, deviceId)) return
      clearTimeout(timer)
      off()
      resolve(true)
    })
  })
}

/** Open a CyberUnicorn over the internet relay as a protocol transport (kind 'relay'). */
export async function openRelayTransport(deviceId: string, opts: RelayTransportOptions = {}): Promise<Transport> {
  const j = await join(deviceId, opts)
  const { client, channel, text } = j
  const timeoutMs = opts.timeoutMs ?? 8000
  const graceMs = opts.offlineGraceMs ?? 10000

  let online = await waitForBoard(j, deviceId, opts.requireOnline === false ? 0 : timeoutMs)
  if (!online && opts.requireOnline !== false) {
    await client.removeChannel(channel).catch(() => undefined)
    throw new Error(NOT_ONLINE)
  }

  const closed = new Emitter<string>()
  let open = true
  let offlineTimer: ReturnType<typeof setTimeout> | null = null
  const unsubs: (() => void)[] = []

  const drop = (reason: string) => {
    if (!open) return
    open = false
    if (offlineTimer) clearTimeout(offlineTimer)
    for (const u of unsubs) u()
    void client.removeChannel(channel).catch(() => undefined)
    closed.emit(reason)
    closed.clear()
    text.clear()
  }

  unsubs.push(
    j.status.on(({ status }) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') drop('The internet relay closed the connection.')
    }),
    j.presence.on(() => {
      const present = boardPresent(channel, deviceId)
      if (present) {
        online = true
        if (offlineTimer) clearTimeout(offlineTimer)
        offlineTimer = null
      } else if (online && !offlineTimer) {
        offlineTimer = setTimeout(() => {
          offlineTimer = null
          if (!boardPresent(channel, deviceId)) drop(OFFLINE)
        }, graceMs)
      }
    }),
  )

  return {
    kind: 'relay',
    label: opts.label ?? 'Internet',
    async write(chunk: string) {
      if (!open) throw new Error('Not connected.')
      for (const raw of chunk.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        // The board runs only protocol requests from the relay, never raw CLI.
        if (!line.startsWith('rpc ')) throw new Error('Only commands can go over the internet. Use USB for that.')
        const res = await channel.send({ type: 'broadcast', event: 'rpc', payload: { line } })
        if (res !== 'ok') throw new Error('The command did not reach the internet relay.')
      }
    },
    onText: (listener) => text.on(listener),
    onClose: (listener) => closed.on(listener),
    async close() {
      if (!open) return
      open = false
      if (offlineTimer) clearTimeout(offlineTimer)
      for (const u of unsubs) u()
      closed.clear()
      text.clear()
      await client.removeChannel(channel).catch(() => undefined)
    },
  }
}

/** Whether the board is on its relay channel right now. False when the caller may not join it. */
export async function relayDeviceOnline(deviceId: string, opts: Pick<RelayTransportOptions, 'timeoutMs' | 'client'> = {}): Promise<boolean> {
  let j: Joined
  try {
    j = await join(deviceId, opts)
  } catch {
    return false
  }
  try {
    return await waitForBoard(j, deviceId, opts.timeoutMs ?? 4000)
  } finally {
    await j.client.removeChannel(j.channel).catch(() => undefined)
  }
}
