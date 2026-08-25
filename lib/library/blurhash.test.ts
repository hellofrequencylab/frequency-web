import { describe, it, expect } from 'vitest'
import { encodeBlurhash, isValidBlurhash } from './blurhash'
import { dominantColors, readImageDescriptor, appendImageDescriptor } from './image-describe'

// The BROWSER half of Loom ingest (PROG-D1) — the parts that are pure arithmetic and can therefore
// be tested without a canvas. `describeImage` itself needs a real ImageBitmap and is exercised in a
// browser; everything it DEPENDS on is pinned here, including the validation the server applies to
// what a client posts.

/** A solid block of one colour, as RGBA. */
function solid(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r
    px[i * 4 + 1] = g
    px[i * 4 + 2] = b
    px[i * 4 + 3] = a
  }
  return px
}

/** Left half one colour, right half another — a horizontal gradient's simplest form. */
function split(w: number, h: number, left: [number, number, number], right: [number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? left : right
      const i = (y * w + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
  return px
}

describe('encodeBlurhash', () => {
  it('produces a string of the length its own component header declares', () => {
    // The length is not arbitrary: 1 size byte + 1 max byte + 4 DC + 2 per AC component. Getting it
    // wrong is the failure that makes a hash decode to noise in a viewer, so it is asserted against
    // the same rule the validator uses rather than against a magic number.
    const hash = encodeBlurhash(solid(8, 8, 120, 40, 200), 8, 8, 4, 3)
    expect(hash).not.toBeNull()
    expect(hash).toHaveLength(4 + 2 * 4 * 3)
    expect(isValidBlurhash(hash)).toBe(true)
  })

  it('is deterministic, and DIFFERENT pictures get different hashes', () => {
    const a = encodeBlurhash(solid(8, 8, 200, 30, 30), 8, 8)
    const again = encodeBlurhash(solid(8, 8, 200, 30, 30), 8, 8)
    const b = encodeBlurhash(solid(8, 8, 30, 30, 200), 8, 8)
    expect(a).toBe(again)
    expect(a).not.toBe(b)
  })

  it('carries STRUCTURE, not just an average colour', () => {
    // A left-red/right-blue split and a flat purple average to nearly the same colour. If the
    // transform were only computing a mean, these two would collide — which is exactly the bug that
    // makes a blurhash useless as a placeholder.
    const structured = encodeBlurhash(split(16, 16, [255, 0, 0], [0, 0, 255]), 16, 16)
    const flat = encodeBlurhash(solid(16, 16, 128, 0, 128), 16, 16)
    expect(structured).not.toBe(flat)
  })

  it('returns null rather than throwing on malformed input', () => {
    expect(encodeBlurhash(new Uint8ClampedArray(10), 8, 8)).toBeNull()       // wrong buffer length
    expect(encodeBlurhash(solid(4, 4, 0, 0, 0), 0, 4)).toBeNull()            // zero dimension
    expect(encodeBlurhash(solid(4, 4, 0, 0, 0), 4, 4, 12, 3)).toBeNull()     // component out of range
  })
})

describe('isValidBlurhash guards what a client may write', () => {
  it('accepts a hash this module produced', () => {
    expect(isValidBlurhash(encodeBlurhash(solid(8, 8, 10, 200, 90), 8, 8))).toBe(true)
  })

  it('rejects the wrong alphabet, the wrong length, and the wrong type', () => {
    const good = encodeBlurhash(solid(8, 8, 10, 200, 90), 8, 8) as string
    expect(isValidBlurhash(`${good}extra`)).toBe(false)          // length disagrees with the header
    expect(isValidBlurhash(good.slice(0, -1))).toBe(false)
    expect(isValidBlurhash(`<script>${good.slice(8)}`)).toBe(false) // '<' is not in base83
    expect(isValidBlurhash(null)).toBe(false)
    expect(isValidBlurhash(42)).toBe(false)
    expect(isValidBlurhash('')).toBe(false)
  })
})

describe('dominantColors', () => {
  it('reports the colour that is actually there, not a rounded bin centre', () => {
    // The bin for (200,30,30) spans a 64-wide cube. A naive implementation returns the cube's
    // corner or centre; this one averages the real pixels, so it returns the real colour.
    expect(dominantColors(solid(8, 8, 200, 30, 30), 8, 8)).toEqual(['#c81e1e'])
  })

  it('orders by how much of the picture each colour occupies', () => {
    const px = new Uint8ClampedArray(10 * 1 * 4)
    for (let x = 0; x < 10; x++) {
      const c = x < 7 ? [10, 10, 240] : [240, 10, 10]
      px.set([c[0], c[1], c[2], 255], x * 4)
    }
    const colors = dominantColors(px, 10, 1)
    expect(colors).toHaveLength(2)
    expect(colors[0]).toBe('#0a0af0')
    expect(colors[1]).toBe('#f00a0a')
  })

  it('IGNORES transparent pixels', () => {
    // A logo on a transparent canvas must report the logo's colour, never the void behind it.
    const px = new Uint8ClampedArray(4 * 1 * 4)
    px.set([0, 0, 0, 0], 0)
    px.set([0, 0, 0, 0], 4)
    px.set([0, 0, 0, 0], 8)
    px.set([12, 200, 90, 255], 12)
    expect(dominantColors(px, 4, 1)).toEqual(['#0cc85a'])
  })

  it('returns [] for a malformed buffer', () => {
    expect(dominantColors(new Uint8ClampedArray(7), 4, 4)).toEqual([])
  })
})

describe('readImageDescriptor treats the browser as untrusted', () => {
  const hash = encodeBlurhash(solid(8, 8, 10, 200, 90), 8, 8) as string

  it('round-trips a descriptor the browser produced', () => {
    const form = new FormData()
    appendImageDescriptor(form, { origWidth: 4032, origHeight: 3024, blurhash: hash, colors: ['#0cc85a', '#123456'] })
    expect(readImageDescriptor(form)).toEqual({
      blurhash: hash,
      colors: ['#0cc85a', '#123456'],
      origWidth: 4032,
      origHeight: 3024,
    })
  })

  it('drops a malformed blurhash, a non-hex colour, and an implausible dimension', () => {
    const form = new FormData()
    form.set('blurhash', 'not a blurhash at all')
    form.set('colors', '#0cc85a,red,javascript:alert(1),#ABCDEF,;;')
    form.set('origWidth', '-5')
    form.set('origHeight', '999999999')
    expect(readImageDescriptor(form)).toEqual({
      blurhash: null,
      colors: ['#0cc85a', '#abcdef'],
      origWidth: null,
      origHeight: null,
    })
  })

  it('caps the palette, so a hostile client cannot post a thousand colours', () => {
    const form = new FormData()
    form.set('colors', Array.from({ length: 200 }, (_, i) => `#0000${(i % 100).toString().padStart(2, '0')}`).join(','))
    expect(readImageDescriptor(form).colors).toHaveLength(8)
  })

  it('is all-null on an empty form, so a server-only caller simply gets nothing', () => {
    expect(readImageDescriptor(new FormData())).toEqual({
      blurhash: null,
      colors: null,
      origWidth: null,
      origHeight: null,
    })
  })

  it('appendImageDescriptor is a no-op for a null descriptor', () => {
    const form = new FormData()
    appendImageDescriptor(form, null)
    expect([...form.keys()]).toEqual([])
  })
})
