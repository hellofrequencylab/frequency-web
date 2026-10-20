// The CyberUnicorn's screen, mirrored in the browser. Bruce's CLI command `display start` streams every
// TFT draw call over the same USB serial port as the text log (tftLogger.cpp, Bruce 1.16.1), and
// `display stop` ends it. A packet is 0xAA <size> <fn> <big-endian uint16 args...> [utf-8 tail], where
// size is the whole packet including the 3-byte header (include/tftLogger.h). Ported from the Python +
// HTML remote (cyberpunkunicorn-os/remote): ScreenDemux is its read_loop, ScreenMirror its renderer.
//
// ScreenDemux and parsePacket are pure and unit-tested in screen-mirror.test.ts. ScreenMirror needs a
// canvas, so it is client-only.

import { MIRROR_IMAGE_OUTLINE as IMAGE_OUTLINE, rgb565 } from '@/lib/theme/cyberunicorn'

export const SCREEN_W = 320
export const SCREEN_H = 240

const HEADER = 0xaa
const FILL_SCREEN = 0
const SCREEN_INFO = 99
// A packet's size is one byte, so a real partial packet never carries more than 254 bytes.
const MAX_CARRY = 256

function validFn(fn: number): boolean {
  return (fn >= 0 && fn <= 21) || fn === SCREEN_INFO
}

/** Splits a serial byte stream into plain text and screen packets. Keeps a partial packet across chunks. */
export class ScreenDemux {
  private carry: Uint8Array = new Uint8Array(0)

  push(chunk: Uint8Array): { text: Uint8Array; packets: Uint8Array[] } {
    let buf = chunk
    if (this.carry.length) {
      buf = new Uint8Array(this.carry.length + chunk.length)
      buf.set(this.carry)
      buf.set(chunk, this.carry.length)
    }
    const text: number[] = []
    const packets: Uint8Array[] = []
    let i = 0
    while (i < buf.length) {
      if (buf[i] !== HEADER) {
        text.push(buf[i++])
        continue
      }
      if (i + 3 > buf.length) break // need size + fn
      const size = buf[i + 1]
      const fn = buf[i + 2]
      if (size < 3 || !validFn(fn)) {
        text.push(buf[i++]) // not a packet after all
        continue
      }
      if (i + size > buf.length) break // wait for the rest
      packets.push(buf.slice(i, i + size))
      i += size
    }
    this.carry = buf.slice(i)
    if (this.carry.length > MAX_CARRY) {
      // Cannot happen with real packets; never let garbage grow memory.
      for (const b of this.carry) text.push(b)
      this.carry = new Uint8Array(0)
    }
    return { text: Uint8Array.from(text), packets }
  }

  /** Hand back whatever is carried (as text) and start clean. */
  flush(): Uint8Array {
    const out = this.carry
    this.carry = new Uint8Array(0)
    return out
  }
}

// Field layout per draw function (tftLogger.h). `rot` and `fs` are one byte, `txt` and `file` the
// utf-8 tail, colours unsigned RGB565, everything else a signed int16.
const FIELDS: Record<number, readonly string[]> = {
  0: ['fg'],
  1: ['x', 'y', 'w', 'h', 'fg'],
  2: ['x', 'y', 'w', 'h', 'fg'],
  3: ['x', 'y', 'w', 'h', 'r', 'fg'],
  4: ['x', 'y', 'w', 'h', 'r', 'fg'],
  5: ['x', 'y', 'r', 'fg'],
  6: ['x', 'y', 'r', 'fg'],
  7: ['x', 'y', 'x2', 'y2', 'x3', 'y3', 'fg'],
  8: ['x', 'y', 'x2', 'y2', 'x3', 'y3', 'fg'],
  9: ['x', 'y', 'rx', 'ry', 'fg'],
  10: ['x', 'y', 'rx', 'ry', 'fg'],
  11: ['x', 'y', 'x1', 'y1', 'fg'],
  12: ['x', 'y', 'r', 'ir', 'sa', 'ea', 'fg', 'bg'],
  13: ['x', 'y', 'bx', 'by', 'wd', 'fg', 'bg'],
  14: ['x', 'y', 'size', 'fg', 'bg', 'txt'],
  15: ['x', 'y', 'size', 'fg', 'bg', 'txt'],
  16: ['x', 'y', 'size', 'fg', 'bg', 'txt'],
  17: ['x', 'y', 'size', 'fg', 'bg', 'txt'],
  18: ['x', 'y', 'center', 'ms', 'fs', 'file'],
  19: ['x', 'y', 'fg'],
  20: ['x', 'y', 'h', 'fg'],
  21: ['x', 'y', 'w', 'fg'],
  99: ['w', 'h', 'rot'],
}
const BYTE_FIELDS = new Set(['rot', 'fs'])
const COLOR_FIELDS = new Set(['fg', 'bg'])

/** One decoded draw call. Numeric fields are named as in tftLogger.h; `txt` / `file` hold the tail. */
type ScreenOp = { fn: number; txt?: string; file?: string } & Record<string, number>

/** Decode one packet (header included) into its named fields. Missing bytes read as 0. */
export function parsePacket(p: Uint8Array): ScreenOp {
  const fn = p[2]
  const o = { fn } as ScreenOp
  const rec = o as Record<string, number | string>
  let i = 3
  for (const k of FIELDS[fn] ?? []) {
    if (k === 'txt' || k === 'file') {
      rec[k] = new TextDecoder().decode(p.slice(i))
      i = p.length
    } else if (BYTE_FIELDS.has(k)) {
      rec[k] = p[i++] ?? 0
    } else {
      let v = ((p[i] ?? 0) << 8) | (p[i + 1] ?? 0)
      i += 2
      if (!COLOR_FIELDS.has(k) && v > 32767) v -= 65536
      rec[k] = v
    }
  }
  return o
}


/** Paints screen packets onto a canvas, the way the reference remote does. */
export class ScreenMirror {
  private ctx: CanvasRenderingContext2D

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw the screen mirror.')
    this.ctx = ctx
    if (canvas.width !== SCREEN_W || canvas.height !== SCREEN_H) {
      canvas.width = SCREEN_W
      canvas.height = SCREEN_H
    }
  }

  /** Back to a black screen at the default size. */
  clear() {
    if (this.canvas.width !== SCREEN_W || this.canvas.height !== SCREEN_H) {
      this.canvas.width = SCREEN_W
      this.canvas.height = SCREEN_H
    }
    this.ctx.fillStyle = rgb565(0)
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  draw(packet: Uint8Array) {
    const o = parsePacket(packet)
    const ctx = this.ctx
    const canvas = this.canvas
    ctx.lineWidth = 1
    switch (o.fn) {
      case SCREEN_INFO:
        if (o.w > 0 && o.h > 0 && (canvas.width !== o.w || canvas.height !== o.h)) {
          canvas.width = o.w
          canvas.height = o.h
        }
        break
      case FILL_SCREEN:
        ctx.fillStyle = rgb565(o.fg)
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        break
      case 1:
        ctx.strokeStyle = rgb565(o.fg)
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1)
        break
      case 2:
        ctx.fillStyle = rgb565(o.fg)
        ctx.fillRect(o.x, o.y, o.w, o.h)
        break
      case 3:
        ctx.strokeStyle = rgb565(o.fg)
        this.roundRect(o)
        ctx.stroke()
        break
      case 4:
        ctx.fillStyle = rgb565(o.fg)
        this.roundRect(o)
        ctx.fill()
        break
      case 5:
        ctx.strokeStyle = rgb565(o.fg)
        ctx.beginPath()
        ctx.arc(o.x, o.y, Math.max(0, o.r), 0, 7)
        ctx.stroke()
        break
      case 6:
        ctx.fillStyle = rgb565(o.fg)
        ctx.beginPath()
        ctx.arc(o.x, o.y, Math.max(0, o.r + 0.5), 0, 7)
        ctx.fill()
        break
      case 7:
      case 8:
        ctx.beginPath()
        ctx.moveTo(o.x, o.y)
        ctx.lineTo(o.x2, o.y2)
        ctx.lineTo(o.x3, o.y3)
        ctx.closePath()
        if (o.fn === 8) {
          ctx.fillStyle = rgb565(o.fg)
          ctx.fill()
        } else {
          ctx.strokeStyle = rgb565(o.fg)
          ctx.stroke()
        }
        break
      case 9:
      case 10:
        ctx.beginPath()
        ctx.ellipse(o.x, o.y, Math.abs(o.rx), Math.abs(o.ry), 0, 0, 7)
        if (o.fn === 10) {
          ctx.fillStyle = rgb565(o.fg)
          ctx.fill()
        } else {
          ctx.strokeStyle = rgb565(o.fg)
          ctx.stroke()
        }
        break
      case 11:
        ctx.strokeStyle = rgb565(o.fg)
        ctx.beginPath()
        ctx.moveTo(o.x + 0.5, o.y + 0.5)
        ctx.lineTo(o.x1 + 0.5, o.y1 + 0.5)
        ctx.stroke()
        break
      case 12: {
        // TFT_eSPI arcs: 0 degrees at 6 o'clock, clockwise.
        ctx.strokeStyle = rgb565(o.fg)
        ctx.lineWidth = Math.max(1, o.r - o.ir)
        ctx.beginPath()
        ctx.arc(o.x, o.y, Math.max(0, (o.r + o.ir) / 2), ((o.sa + 90) * Math.PI) / 180, ((o.ea + 90) * Math.PI) / 180)
        ctx.stroke()
        break
      }
      case 13:
        ctx.strokeStyle = rgb565(o.fg)
        ctx.lineWidth = o.wd || 1
        ctx.beginPath()
        ctx.moveTo(o.x, o.y)
        ctx.lineTo(o.bx, o.by)
        ctx.stroke()
        break
      case 14:
      case 15:
      case 16:
      case 17:
        this.text(o)
        break
      case 18: {
        // Image files live on the device; outline where they would be.
        ctx.strokeStyle = IMAGE_OUTLINE
        ctx.setLineDash([3, 3])
        const w = 64
        const h = 48
        const x = o.center ? (canvas.width - w) / 2 + o.x : o.x
        const y = o.center ? (canvas.height - h) / 2 + o.y : o.y
        ctx.strokeRect(x + 0.5, y + 0.5, w, h)
        ctx.setLineDash([])
        break
      }
      case 19:
        ctx.fillStyle = rgb565(o.fg)
        ctx.fillRect(o.x, o.y, 1, 1)
        break
      case 20:
        ctx.fillStyle = rgb565(o.fg)
        ctx.fillRect(o.x, o.y, 1, o.h)
        break
      case 21:
        ctx.fillStyle = rgb565(o.fg)
        ctx.fillRect(o.x, o.y, o.w, 1)
        break
    }
  }

  private roundRect(o: ScreenOp) {
    const r = Math.max(0, Math.min(o.r, o.w / 2, o.h / 2))
    this.ctx.beginPath()
    this.ctx.roundRect(o.x, o.y, o.w, o.h, r)
  }

  private text(o: ScreenOp) {
    // Bruce's GLCD font: 6x8 px cells, scaled by text size.
    const ctx = this.ctx
    const s = Math.max(1, o.size)
    const cw = 6 * s
    const ch = 8 * s
    const t = (o.txt ?? '').replace(/[\r\n]/g, '')
    let x = o.x
    if (o.fn === 14) x -= (t.length * cw) / 2
    if (o.fn === 15) x -= t.length * cw
    if (o.bg !== o.fg) {
      ctx.fillStyle = rgb565(o.bg)
      ctx.fillRect(x, o.y, t.length * cw, ch)
    }
    ctx.fillStyle = rgb565(o.fg)
    ctx.font = `bold ${8.5 * s}px Menlo, monospace`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    for (let i = 0; i < t.length; i++) ctx.fillText(t[i], x + i * cw + cw / 2, o.y)
  }
}
