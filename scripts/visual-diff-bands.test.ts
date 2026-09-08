// The recapture reader (ADR-1273): a diff count is not a cause, so the reader says WHERE.
//
// Proven here: the dependency-free PNG decoder inverts every PNG filter type (a hand-filtered
// fixture per filter, plus a real committed baseline whose IHDR is read off the raw bytes), the
// YIQ delta counts what pixelmatch counts and ignores what the threshold forgives, bands are
// contiguous rows sorted by weight, a dimension mismatch is reported instead of counted, and the
// mirrored budget cannot drift from playwright.config.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import config, { SCREENSHOT_MAX_DIFF_PIXELS } from '../playwright.config'
import {
  DEFAULT_BUDGET,
  DEFAULT_DIR,
  DEFAULT_THRESHOLD,
  bandsOf,
  compareSources,
  decodePng,
  diffImages,
  encodePng,
  openSource,
  summarize,
} from './visual-diff-bands.mjs'

type Img = { width: number; height: number; data: Uint8Array }

function solid(width: number, height: number, rgba: [number, number, number, number]): Img {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { width, height, data }
}
function paintRows(img: Img, from: number, to: number, rgba: [number, number, number, number]): Img {
  const data = new Uint8Array(img.data)
  for (let y = from; y <= to; y++) for (let x = 0; x < img.width; x++) data.set(rgba, (y * img.width + x) * 4)
  return { ...img, data }
}

// A PNG writer that applies one FILTER TYPE to every row, the way libpng's adaptive filtering
// does per row, so the decoder's unfilter arms are exercised one at a time. The encoder in the
// script only ever writes filter 0; a decoder proven only against its own encoder proves nothing.
function crc32(bytes: Uint8Array): number {
  let c = -1
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ -1) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodeFiltered(img: Img, filter: 0 | 1 | 2 | 3 | 4, colorType: 2 | 6 = 6): Buffer {
  const bpp = colorType === 6 ? 4 : 3
  const stride = img.width * bpp
  const rows: Uint8Array[] = []
  for (let y = 0; y < img.height; y++) {
    const row = new Uint8Array(stride)
    for (let x = 0; x < img.width; x++) for (let k = 0; k < bpp; k++) row[x * bpp + k] = img.data[(y * img.width + x) * 4 + k]
    rows.push(row)
  }
  const raw = Buffer.alloc((stride + 1) * img.height)
  const zero = new Uint8Array(stride)
  for (let y = 0; y < img.height; y++) {
    const cur = rows[y]
    const prev = y > 0 ? rows[y - 1] : zero
    raw[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      const v = cur[x]
      let f = v
      if (filter === 1) f = v - a
      else if (filter === 2) f = v - b
      else if (filter === 3) f = v - ((a + b) >> 1)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        f = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      raw[y * (stride + 1) + 1 + x] = f & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.width, 0)
  ihdr.writeUInt32BE(img.height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
/** A gradient with structure in both directions, so Sub/Up/Average/Paeth all do real work. */
function textured(width: number, height: number): Img {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = (x * 37 + y * 11) & 255
      data[i + 1] = (x * 5 + y * 29) & 255
      data[i + 2] = (x * y) & 255
      data[i + 3] = 255
    }
  return { width, height, data }
}

const tmp: string[] = []
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }) })
function dir(files: Record<string, Buffer>): string {
  const d = mkdtempSync(join(tmpdir(), 'visual-diff-bands-'))
  tmp.push(d)
  for (const [name, buf] of Object.entries(files)) writeFileSync(join(d, name), buf)
  return d
}

describe('PNG decoder', () => {
  it('round-trips the script encoder', () => {
    const img = textured(23, 17)
    const back = decodePng(encodePng(img))
    expect([back.width, back.height]).toEqual([23, 17])
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true)
  })

  it.each([0, 1, 2, 3, 4] as const)('inverts PNG filter type %i on RGBA rows', (filter) => {
    const img = textured(31, 13)
    const back = decodePng(encodeFiltered(img, filter, 6))
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true)
  })

  it('reads RGB (colour type 2) as opaque RGBA', () => {
    const img = textured(9, 7)
    const back = decodePng(encodeFiltered(img, 4, 2))
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true)
  })

  it('refuses what Playwright never writes instead of guessing', () => {
    const bad = encodeFiltered(textured(4, 4), 0, 6)
    bad[24 + 1] = 16 // IHDR bit depth byte: 8 -> 16
    expect(() => decodePng(bad)).toThrow(/unsupported PNG/)
    expect(() => decodePng(Buffer.from('not a png'))).toThrow(/not a PNG/)
  })

  it('decodes a real committed baseline and agrees with its IHDR', () => {
    const files = readdirSync(DEFAULT_DIR).filter((f) => f.endsWith('.png')).sort()
    expect(files.length).toBeGreaterThan(0)
    const buf = readFileSync(join(DEFAULT_DIR, files[0]))
    const img = decodePng(buf)
    // IHDR is the first chunk: 8 signature + 4 length + 4 type, then width and height.
    expect(img.width).toBe(buf.readUInt32BE(16))
    expect(img.height).toBe(buf.readUInt32BE(20))
    expect(img.data.length).toBe(img.width * img.height * 4)
  })
})

describe('diff and bands', () => {
  const base = solid(40, 30, [250, 250, 250, 255])

  it('counts nothing for identical images', () => {
    const r = diffImages(base, base)
    expect(r).toMatchObject({ dimensionMismatch: false, differing: 0, bands: [] })
  })

  it('locates a changed row band and weighs it', () => {
    const changed = paintRows(base, 10, 12, [30, 30, 30, 255])
    const r = diffImages(base, changed)
    if (r.dimensionMismatch) throw new Error('unexpected mismatch')
    expect(r.differing).toBe(3 * 40)
    expect(r.bands).toEqual([{ from: 10, to: 12, rows: 3, pixels: 120 }])
  })

  it('sorts several bands by weight, heaviest first', () => {
    const changed = paintRows(paintRows(base, 2, 2, [0, 0, 0, 255]), 20, 24, [0, 0, 0, 255])
    const r = diffImages(base, changed)
    if (r.dimensionMismatch || !r.bands) throw new Error('unexpected mismatch')
    expect(r.bands.map((b) => [b.from, b.to, b.pixels])).toEqual([
      [20, 24, 200],
      [2, 2, 40],
    ])
  })

  it('forgives what the threshold forgives, exactly as pixelmatch does', () => {
    // 250 -> 246 grey: a YIQ delta of ~8, far under 0.2^2 * 35215 = 1408.6
    const faint = paintRows(base, 5, 6, [246, 246, 246, 255])
    const r = diffImages(base, faint)
    if (r.dimensionMismatch) throw new Error('unexpected mismatch')
    expect(r.differing).toBe(0)
    // and the same change is counted at a threshold of 0
    const strict = diffImages(base, faint, { threshold: 0 })
    if (strict.dimensionMismatch) throw new Error('unexpected mismatch')
    expect(strict.differing).toBe(80)
  })

  it('reports a dimension mismatch instead of counting, as toHaveScreenshot does', () => {
    const r = diffImages(base, solid(40, 31, [250, 250, 250, 255]))
    expect(r).toEqual({ dimensionMismatch: true, a: '40x30', b: '40x31' })
  })

  it('bandsOf splits on empty rows', () => {
    expect(bandsOf(new Uint32Array([0, 3, 3, 0, 0, 9, 0]))).toEqual([
      { from: 5, to: 5, rows: 1, pixels: 9 },
      { from: 1, to: 2, rows: 2, pixels: 6 },
    ])
  })
})

describe('sources and summary', () => {
  it('compares two directories by file name and summarises every outcome', () => {
    // 25x20: every pixel repainted is 500 px, over the 400 budget; a 20x20 repaint would be exactly
    // 400, which toHaveScreenshot forgives, and the summary agrees with it (<= is under).
    const same = encodePng(solid(25, 20, [200, 200, 200, 255]))
    const moved = encodePng(paintRows(solid(25, 20, [200, 200, 200, 255]), 0, 19, [0, 0, 0, 255]))
    const taller = encodePng(solid(25, 21, [200, 200, 200, 255]))
    const a = dir({ 'x.png': same, 'y.png': same, 'z.png': same, 'only-a.png': same })
    const b = dir({ 'x.png': same, 'y.png': moved, 'z.png': taller })
    const results = compareSources(openSource(a, DEFAULT_DIR), openSource(b, DEFAULT_DIR))
    expect(results.map((r) => r.name)).toEqual(['only-a.png', 'x.png', 'y.png', 'z.png'])
    expect(summarize(results, 400)).toEqual({ files: 4, identical: 1, underBudget: 0, overBudget: 1, dimensionMoved: 1, missing: 1 })
    const y = results.find((r) => r.name === 'y.png')
    expect(y).toMatchObject({ differing: 500, bands: [{ from: 0, to: 19, rows: 20, pixels: 500 }] })
  })

  it('narrows to a substring with --only', () => {
    const png = encodePng(solid(4, 4, [1, 2, 3, 255]))
    const a = dir({ 'app-feed.png': png, 'about.png': png })
    const results = compareSources(openSource(a, DEFAULT_DIR), openSource(a, DEFAULT_DIR), { only: 'app-' })
    expect(results.map((r) => r.name)).toEqual(['app-feed.png'])
  })

  it('names a spec that is neither a directory nor a ref', () => {
    expect(() => openSource('definitely-not-a-ref-or-dir', DEFAULT_DIR)).toThrow(/neither a directory nor a git ref/)
  })
})

describe('the mirrored numbers cannot drift from the config', () => {
  it('prints ADR-1258’s budget, read from the same export the gate uses', () => {
    expect(DEFAULT_BUDGET).toBe(SCREENSHOT_MAX_DIFF_PIXELS)
  })

  it('uses the threshold the config uses (Playwright’s default when unset)', () => {
    const configured = (config.expect?.toHaveScreenshot as { threshold?: number } | undefined)?.threshold
    expect(configured ?? 0.2).toBe(DEFAULT_THRESHOLD)
  })

  it('DEFAULT_DIR is where the committed baselines live', () => {
    expect(readdirSync(DEFAULT_DIR).some((f) => f.endsWith('.png'))).toBe(true)
  })
})
