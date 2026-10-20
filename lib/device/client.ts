import { describeDeviceError, encodeRequest, LineSplitter, parseLine, timeoutFor, type Command, type DeviceErrorCode, type DeviceEvent } from './protocol'
import { Emitter, type Transport } from './transport'

// The RPC client: one request at a time per transport, each waiting for its `@rpc` reply or a timeout
// (PROTOCOL.md §1 "Concurrency": on BLE a second write before the device read the first overwrites
// it). Lines that are not protocol lines go to the console log; events go to subscribers.

export class DeviceError extends Error {
  readonly code: DeviceErrorCode
  constructor(code: DeviceErrorCode, message?: string) {
    super(describeDeviceError(code, message))
    this.code = code
  }
}

export type LogLine = { at: number; dir: 'in' | 'out' | 'note'; text: string }

type Pending = { id: number; resolve: (data: unknown) => void; reject: (e: DeviceError) => void; timer: ReturnType<typeof setTimeout> }

export class RpcClient {
  private nextId = 1
  private queue: Promise<unknown> = Promise.resolve()
  private pending: Pending | null = null
  private splitter = new LineSplitter()
  private unsubscribe: (() => void)[] = []
  private closed = false
  readonly events = new Emitter<DeviceEvent>()
  readonly log = new Emitter<LogLine>()

  constructor(readonly transport: Transport) {
    this.unsubscribe.push(transport.onText((t) => this.onText(t)))
    this.unsubscribe.push(
      transport.onClose((reason) => {
        this.closed = true
        this.log.emit({ at: Date.now(), dir: 'note', text: `Disconnected: ${reason}` })
        this.failPending(new DeviceError('disconnected'))
      }),
    )
  }

  /** Send one command and wait for its reply. Requests are serialized. `timeoutMs` overrides the
   *  per-command default (a tag write told to wait 30 s for a card needs longer than 12 s). */
  call<T = Record<string, unknown>>(cmd: Command, args?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T> {
    const run = () => this.send<T>(cmd, args, opts?.timeoutMs)
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }

  private send<T>(cmd: Command, args?: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    if (this.closed) return Promise.reject(new DeviceError('disconnected'))
    const id = this.nextId++
    const line = encodeRequest(id, cmd, args)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.id === id) this.pending = null
        reject(new DeviceError('timeout'))
      }, timeoutMs ?? timeoutFor(cmd))
      this.pending = { id, resolve: resolve as (d: unknown) => void, reject, timer }
      this.log.emit({ at: Date.now(), dir: 'out', text: line.trimEnd() })
      this.transport.write(line).catch((e: unknown) => {
        clearTimeout(timer)
        if (this.pending?.id === id) this.pending = null
        reject(new DeviceError('disconnected', e instanceof Error ? e.message : undefined))
      })
    })
  }

  private onText(text: string) {
    for (const raw of this.splitter.push(text)) {
      const parsed = parseLine(raw)
      if (parsed.kind === 'other') {
        this.log.emit({ at: Date.now(), dir: 'in', text: parsed.text })
        continue
      }
      this.log.emit({ at: Date.now(), dir: 'in', text: raw })
      if (parsed.kind === 'evt') {
        this.events.emit(parsed.event)
        continue
      }
      const p = this.pending
      // A reply for a request that already timed out (or a bad_json with id null) has no taker.
      if (!p || (parsed.reply.id !== null && parsed.reply.id !== p.id)) continue
      this.pending = null
      clearTimeout(p.timer)
      if (parsed.reply.ok) p.resolve(parsed.reply.data)
      else p.reject(new DeviceError(parsed.reply.error, parsed.reply.message))
    }
  }

  private failPending(e: DeviceError) {
    const p = this.pending
    this.pending = null
    if (p) {
      clearTimeout(p.timer)
      p.reject(e)
    }
  }

  async close() {
    this.closed = true
    this.failPending(new DeviceError('disconnected'))
    for (const u of this.unsubscribe) u()
    this.events.clear()
    await this.transport.close()
    this.log.clear()
  }
}
