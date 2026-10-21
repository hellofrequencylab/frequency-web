import { describeDeviceError, encodeRequest, LineSplitter, parseLine, redactLine, timeoutFor, type Command, type DeviceErrorCode, type DeviceEvent } from './protocol'
import { Emitter, type Transport } from './transport'

// The RPC client: one request at a time per transport, each waiting for its `@rpc` reply or a timeout
// (PROTOCOL.md §1 "Concurrency": on BLE a second write before the device read the first overwrites
// it). Lines that are not protocol lines go to the console log; events go to subscribers. Every log line
// passes redactLine first, so a secret, a Wi-Fi password or a card token never reaches the screen.

export class DeviceError extends Error {
  readonly code: DeviceErrorCode
  /** The board's own words for a failed command (`@rpc ... "message"`), kept apart from the person-facing
   *  text: a tap that times out on the board ("No card (43 polls: ...)") is not the cable going quiet. */
  readonly detail: string
  constructor(code: DeviceErrorCode, message?: string) {
    super(describeDeviceError(code, message))
    this.code = code
    this.detail = message ?? ''
  }
}

export type LogLine = { at: number; dir: 'in' | 'out' | 'note'; text: string }

type Pending = { id: number; resolve: (data: unknown) => void; reject: (e: DeviceError) => void; timer: ReturnType<typeof setTimeout> }

/** At most this many screen packets are kept for a late canvas (a full menu is a few thousand). */
const SCREEN_BACKLOG_MAX = 8000

export class RpcClient {
  private nextId = 1
  private queue: Promise<unknown> = Promise.resolve()
  private pending: Pending | null = null
  private splitter = new LineSplitter()
  private unsubscribe: (() => void)[] = []
  private closed = false
  readonly events = new Emitter<DeviceEvent>()
  readonly log = new Emitter<LogLine>()
  /** Bruce screen packets, while `setScreenStream(true)` is on (screen-mirror.ts draws them). */
  readonly screen = new Emitter<Uint8Array>()
  // The draw calls since the board last cleared its screen. `display start` redraws the whole menu at
  // once, usually before the page has mounted its mirror canvas, and a still menu sends nothing more, so
  // a canvas that only heard new packets stayed black (owner, 2026-10-20). watchScreen replays these first.
  private screenBacklog: Uint8Array[] = []

  constructor(readonly transport: Transport) {
    this.unsubscribe.push(transport.onText((t) => this.onText(t)))
    if (transport.onScreen)
      this.unsubscribe.push(
        transport.onScreen((p) => {
          // fn 0 is fillScreen: everything before it is painted over.
          if (p[2] === 0) this.screenBacklog = []
          this.screenBacklog.push(p)
          if (this.screenBacklog.length > SCREEN_BACKLOG_MAX) this.screenBacklog.splice(0, this.screenBacklog.length - SCREEN_BACKLOG_MAX)
          this.screen.emit(p)
        }),
      )
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

  /** Whether this transport can carry the screen mirror (USB only). */
  get canMirror(): boolean {
    return typeof this.transport.onScreen === 'function' && typeof this.transport.setScreenStream === 'function'
  }

  /** Split screen packets out of the serial stream (pair with `raw('display start')`). No-op if unsupported. */
  setScreenStream(on: boolean) {
    if (!on) this.screenBacklog = []
    this.transport.setScreenStream?.(on)
  }

  /** Follow the screen stream, starting with the draw calls since the last clear, so a canvas mounted after
   *  `display start` still gets the whole frame. Returns the unsubscribe. */
  watchScreen(listener: (packet: Uint8Array) => void): () => void {
    for (const p of this.screenBacklog) listener(p)
    return this.screen.on(listener)
  }

  /** Write a plain Bruce CLI line (`display start`, `nav sel`). It waits its turn in the same queue as
   *  call(), so it never lands in the middle of a pending request, and expects no reply. */
  raw(line: string): Promise<void> {
    const run = async () => {
      if (this.closed) throw new DeviceError('disconnected')
      const text = line.trim()
      this.log.emit({ at: Date.now(), dir: 'out', text: redactLine(text) })
      try {
        await this.transport.write(text + '\n')
      } catch (e) {
        throw new DeviceError('disconnected', e instanceof Error ? e.message : undefined)
      }
    }
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
      this.log.emit({ at: Date.now(), dir: 'out', text: redactLine(line.trimEnd()) })
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
        this.log.emit({ at: Date.now(), dir: 'in', text: redactLine(parsed.text) })
        continue
      }
      this.log.emit({ at: Date.now(), dir: 'in', text: redactLine(raw) })
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
    this.screen.clear()
    this.screenBacklog = []
    await this.transport.close()
    this.log.clear()
  }
}
