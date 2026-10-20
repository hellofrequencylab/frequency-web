// CyberUnicorn 5000 remote protocol v1, the phone half. The device half and the prose live in
// cyberpunkunicorn-os/apps/remote/PROTOCOL.md; change both together.
//
//   phone  -> device   rpc {"id":<int>,"cmd":"<name>","args":{...}}\n
//   device -> phone    @rpc {"id":<same>,"ok":true,"data":{...}}
//                      @rpc {"id":<same>,"ok":false,"error":"<code>","message":"<text>"}
//                      @evt {"event":"<name>","data":{...}}
//
// Every other line is Bruce's own log output and is ignored, as is a protocol line whose JSON does not
// parse (another task's log can land inside one). Pure: tested under plain Node (protocol.test.ts).

/** The commands v1 defines. Any of them may answer `not_available` until its app is in the build. */
export type Command =
  | 'system.status'
  | 'apps.list'
  | 'screen.nav'
  | 'cli.run'
  | 'hat.probe'
  | 'lightshow.state'
  | 'lightshow.set'
  | 'led.set'
  | 'led.mode'
  | 'sound.tone'
  | 'light.read'
  | 'sensors.read'
  | 'frequency.read_tag'
  | 'frequency.write_tag'
  | 'frequency.scan'

/** PROTOCOL.md §1 error codes, plus the phone's own `timeout` and `disconnected`. */
export type DeviceErrorCode = 'bad_json' | 'unknown_command' | 'not_available' | 'bad_args' | 'busy' | 'timeout' | 'disconnected' | string

export type RpcReply = { id: number | null; ok: true; data: unknown } | { id: number | null; ok: false; error: DeviceErrorCode; message: string }

export type DeviceEvent = { event: string; data: unknown }

export type ParsedLine = { kind: 'rpc'; reply: RpcReply } | { kind: 'evt'; event: DeviceEvent } | { kind: 'other'; text: string }

/** A request line must stay at or under 512 bytes (the BLE attribute limit and the web /cm size). */
export const MAX_REQUEST_BYTES = 512

export function encodeRequest(id: number, cmd: Command | string, args?: Record<string, unknown>): string {
  return `rpc ${JSON.stringify({ id, cmd, args: args ?? {} })}\n`
}

// The doc writes the prefix as ASCII "@". A full-width "＠" (U+FF20) is accepted too, so a build that
// prints either still parses.
const PREFIX = /^[@＠](rpc|evt) (.*)$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseLine(raw: string): ParsedLine {
  const line = raw.replace(/\r$/, '')
  const m = PREFIX.exec(line.trimStart())
  if (!m) return { kind: 'other', text: line }
  let body: unknown
  try {
    body = JSON.parse(m[2]!)
  } catch {
    return { kind: 'other', text: line }
  }
  if (!isObject(body)) return { kind: 'other', text: line }
  if (m[1] === 'evt') {
    if (typeof body.event !== 'string') return { kind: 'other', text: line }
    return { kind: 'evt', event: { event: body.event, data: body.data ?? null } }
  }
  const id = typeof body.id === 'number' ? body.id : null
  if (body.ok === true) return { kind: 'rpc', reply: { id, ok: true, data: body.data ?? {} } }
  if (body.ok === false) {
    return {
      kind: 'rpc',
      reply: { id, ok: false, error: typeof body.error === 'string' ? body.error : 'unknown', message: typeof body.message === 'string' ? body.message : '' },
    }
  }
  return { kind: 'other', text: line }
}

/** Splits a stream of text chunks into complete lines (on \n), keeping the unfinished tail. Blank lines
 *  are dropped: the device writes a \n before and after every protocol line. */
export class LineSplitter {
  private buffer = ''
  /** Bound on an unterminated line, so a stream with no newline cannot grow without limit. */
  private readonly maxLine: number

  constructor(maxLine = 16384) {
    this.maxLine = maxLine
  }

  push(text: string): string[] {
    this.buffer += text
    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    if (this.buffer.length > this.maxLine) this.buffer = this.buffer.slice(-this.maxLine)
    return parts.map((p) => p.replace(/\r$/, '')).filter((p) => p.trim().length > 0)
  }

  reset() {
    this.buffer = ''
  }
}

/** How long to wait for a reply. PROTOCOL.md: ~5 s, and hat.probe / cli.run can take a second or two;
 *  frequency.read_tag waits up to ~5 s for a tag on its own, so it gets more. */
export function timeoutFor(cmd: string): number {
  if (cmd === 'frequency.read_tag' || cmd === 'frequency.write_tag' || cmd === 'frequency.scan') return 12000
  if (cmd === 'cli.run' || cmd === 'hat.probe') return 8000
  return 5000
}

/** What a person reads for a device error code. Sentence case, no em dashes. */
export function describeDeviceError(code: DeviceErrorCode, message?: string): string {
  switch (code) {
    case 'not_available':
      return 'Not in this firmware yet. Update the CyberUnicorn to use it.'
    case 'busy':
      return message ? `The device is busy: ${message}` : 'The device is busy. Try again in a moment.'
    case 'bad_args':
      return message ? `The device refused that: ${message}` : 'The device refused that value.'
    case 'unknown_command':
      return 'This firmware does not know that command.'
    case 'timeout':
      return 'No answer from the device. Check the cable or move closer.'
    case 'disconnected':
      return 'Not connected to a device.'
    case 'bad_json':
      return 'The device could not read that request.'
    default:
      return message || 'Something went wrong on the device.'
  }
}
