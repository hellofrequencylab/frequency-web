import { describe, expect, it } from 'vitest'
import { rgb565 } from '@/lib/theme/cyberunicorn'
import { parsePacket, ScreenDemux } from './screen-mirror'

// Bruce's `display start` stream: binary draw packets mixed into the text log (tftLogger.h).

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)
const join = (...parts: (Uint8Array | number[])[]) => Uint8Array.from(parts.flatMap((p) => [...p]))

// fillRect(x=10, y=-2, w=300, h=20, fg=0xF800): 3 header bytes + 5 uint16 args = 13 bytes.
const FILL_RECT = [0xaa, 13, 2, 0x00, 0x0a, 0xff, 0xfe, 0x01, 0x2c, 0x00, 0x14, 0xf8, 0x00]

describe('ScreenDemux', () => {
  it('splits text and packets', () => {
    const d = new ScreenDemux()
    const out = d.push(join(enc('hello '), FILL_RECT, enc('world\n')))
    expect(dec(out.text)).toBe('hello world\n')
    expect(out.packets).toEqual([Uint8Array.from(FILL_RECT)])
  })

  it('carries a packet split across two chunks', () => {
    const d = new ScreenDemux()
    const a = d.push(join(enc('ab'), FILL_RECT.slice(0, 5)))
    expect(dec(a.text)).toBe('ab')
    expect(a.packets).toEqual([])
    const b = d.push(join(FILL_RECT.slice(5), enc('cd')))
    expect(dec(b.text)).toBe('cd')
    expect(b.packets).toEqual([Uint8Array.from(FILL_RECT)])
  })

  it('waits for size and fn when the chunk ends on the header byte', () => {
    const d = new ScreenDemux()
    expect(d.push(Uint8Array.from([0xaa])).packets).toEqual([])
    expect(d.push(Uint8Array.from(FILL_RECT.slice(1))).packets).toEqual([Uint8Array.from(FILL_RECT)])
  })

  it('treats 0xAA with an invalid fn or size as text', () => {
    const d = new ScreenDemux()
    const out = d.push(Uint8Array.from([0x41, 0xaa, 5, 50, 0x42, 0xaa, 2, 1, 0x43]))
    expect([...out.text]).toEqual([0x41, 0xaa, 5, 50, 0x42, 0xaa, 2, 1, 0x43])
    expect(out.packets).toEqual([])
  })

  it('treats 0xAA with a valid fn but the wrong size as text, then finds the next real packet', () => {
    const d = new ScreenDemux()
    // A colour byte 0xAA followed by what looks like fn 2 with size 40: not a fillRect (13 bytes).
    const out = d.push(join([0xaa, 40, 2], enc('@rpc {}\n'), FILL_RECT))
    expect(dec(out.text.slice(3))).toBe('@rpc {}\n')
    expect(out.packets).toEqual([Uint8Array.from(FILL_RECT)])
  })

  it('accepts a text packet within its size range', () => {
    const d = new ScreenDemux()
    const str = [0xaa, 16, 16, 0, 1, 0, 2, 0, 1, 0xff, 0xff, 0, 0, 0x48, 0x69, 0x21]
    expect(d.push(Uint8Array.from(str)).packets).toEqual([Uint8Array.from(str)])
  })

  it('flush hands back carried bytes', () => {
    const d = new ScreenDemux()
    d.push(Uint8Array.from(FILL_RECT.slice(0, 4)))
    expect([...d.flush()]).toEqual(FILL_RECT.slice(0, 4))
    expect([...d.flush()]).toEqual([])
  })
})

describe('parsePacket', () => {
  it('decodes a fillRect with a signed coordinate and an unsigned colour', () => {
    expect(parsePacket(Uint8Array.from(FILL_RECT))).toEqual({ fn: 2, x: 10, y: -2, w: 300, h: 20, fg: 0xf800 })
  })

  it('decodes a text tail and a screen-info byte field', () => {
    const txt = parsePacket(join([0xaa, 0, 16, 0, 5, 0, 6, 0, 2, 0xff, 0xff, 0, 0], enc('Hi')))
    expect(txt).toMatchObject({ fn: 16, x: 5, y: 6, size: 2, fg: 0xffff, bg: 0, txt: 'Hi' })
    expect(parsePacket(Uint8Array.from([0xaa, 8, 99, 0x01, 0x40, 0x00, 0xf0, 1]))).toEqual({ fn: 99, w: 320, h: 240, rot: 1 })
  })

  it('turns RGB565 into an rgb() string', () => {
    expect(rgb565(0xf800)).toBe('rgb(255,0,0)')
    expect(rgb565(0xffff)).toBe('rgb(255,255,255)')
  })
})
