import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import sharp from 'sharp'
import { fetchRemoteImage, sniffInlineImageType } from './remote-image'

// ── LIVE-155: the Space share card crashed on a webp logo ──────────────────────────────────
//
// 🔴 THE BUG (scan2 L10 R5, 2026-09-05). fetchRemoteImage trusted the origin's content-type and
// emitted `data:image/webp;base64,...`. Satori sizes a base64 data URL by its DECLARED type through
// a switch that only knows png / apng / gif / jpeg; for anything else its size variable stays
// unassigned and the next line spreads it, which V8 reports as `TypeError: u2 is not iterable`.
// One live Space stores its logo as image/webp, and its share card returned a 500 on every scrape.
// Reproduced against the shipped next/og bundle with a webp and an avif data URL.
//
// The contract now: the declared type comes from the BYTES, and only a type Satori can size is
// ever emitted. Everything else is null, and the caller's own fallback carries the card.

/** The only declared types that can leave this module. Satori's data-URL resolver sizes exactly
 *  these; a fifth entry here would need the same proof the header comment cites. */
const SAFE_DATA_URL = /^data:image\/(png|jpeg|gif|svg\+xml);base64,/

const bytes: Record<string, Buffer> = {}

beforeAll(async () => {
  const base = sharp({ create: { width: 4, height: 4, channels: 3, background: '#e2912f' } })
  bytes.png = await base.clone().png().toBuffer()
  bytes.jpeg = await base.clone().jpeg().toBuffer()
  bytes.gif = await base.clone().gif().toBuffer()
  bytes.webp = await base.clone().webp().toBuffer()
  bytes.avif = await base.clone().avif().toBuffer()
  // A HEIC container signature (ftypheic), the shape an iPhone upload takes when the picker does
  // not transcode. sharp cannot encode it without libheif, so the header is enough here.
  bytes.heic = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])
  bytes.svgViewBox = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>')
  bytes.svgSized = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')
  bytes.svgUnsized = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
})

function stubFetch(body: Buffer | null, contentType: string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body ? new Uint8Array(body) : null, { status, headers: { 'content-type': contentType } })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sniffInlineImageType decides from bytes, never from a label', () => {
  it('names the three raster types Satori can size', () => {
    expect(sniffInlineImageType(toArrayBuffer(bytes.png))).toBe('image/png')
    expect(sniffInlineImageType(toArrayBuffer(bytes.jpeg))).toBe('image/jpeg')
    expect(sniffInlineImageType(toArrayBuffer(bytes.gif))).toBe('image/gif')
  })

  it('refuses the types that crash Satori: webp, avif, heic', () => {
    expect(sniffInlineImageType(toArrayBuffer(bytes.webp))).toBeNull()
    expect(sniffInlineImageType(toArrayBuffer(bytes.avif))).toBeNull()
    expect(sniffInlineImageType(toArrayBuffer(bytes.heic))).toBeNull()
  })

  it('accepts an svg only when Satori could size it', () => {
    expect(sniffInlineImageType(toArrayBuffer(bytes.svgViewBox))).toBe('image/svg+xml')
    expect(sniffInlineImageType(toArrayBuffer(bytes.svgSized))).toBe('image/svg+xml')
    // No viewBox and no width+height: Satori throws `missing "viewBox"` on this one.
    expect(sniffInlineImageType(toArrayBuffer(bytes.svgUnsized))).toBeNull()
  })

  it('refuses a jpeg Satori cannot walk to a frame header', () => {
    // SOI + APP0 whose declared length runs past the end of the buffer: Satori throws
    // `Invalid JPEG` here rather than returning a size.
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x4a, 0x46])
    expect(sniffInlineImageType(toArrayBuffer(truncated))).toBeNull()
    // SOI only, then nothing: the walk starts at byte 4 and there is no byte 4.
    expect(sniffInlineImageType(toArrayBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toBeNull()
  })

  it('refuses empty and non-image bytes', () => {
    expect(sniffInlineImageType(new ArrayBuffer(0))).toBeNull()
    expect(sniffInlineImageType(toArrayBuffer(Buffer.from('<!doctype html><html></html>')))).toBeNull()
    expect(sniffInlineImageType(toArrayBuffer(Buffer.from('%PDF-1.4')))).toBeNull()
  })
})

describe('fetchRemoteImage never emits a data URL Satori cannot size', () => {
  it('returns null for a webp served as image/webp (the LIVE-155 logo)', async () => {
    stubFetch(bytes.webp, 'image/webp')
    expect(await fetchRemoteImage('https://cdn.example/logo.webp')).toBeNull()
  })

  it('returns null for avif and heic bodies whatever the header says', async () => {
    stubFetch(bytes.avif, 'image/avif')
    expect(await fetchRemoteImage('https://cdn.example/a.avif')).toBeNull()
    stubFetch(bytes.heic, 'image/jpeg')
    expect(await fetchRemoteImage('https://cdn.example/lies.jpg')).toBeNull()
  })

  it('declares the type the bytes are, even when the header lies', async () => {
    // jpeg declared over png bytes throws `Invalid JPEG` inside Satori; png declared over jpeg bytes
    // returns garbage dimensions. Both are fixed by reading the magic number instead.
    stubFetch(bytes.png, 'image/jpeg')
    const asPng = await fetchRemoteImage('https://cdn.example/really-a-png.jpg')
    expect(asPng?.startsWith('data:image/png;base64,')).toBe(true)
    stubFetch(bytes.jpeg, 'image/png')
    const asJpeg = await fetchRemoteImage('https://cdn.example/really-a-jpeg.png')
    expect(asJpeg?.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it.each(['png', 'jpeg', 'gif', 'svgViewBox'])('inlines a well-formed %s unchanged', async (kind) => {
    const type = kind === 'svgViewBox' ? 'image/svg+xml' : `image/${kind}`
    stubFetch(bytes[kind], type)
    const url = await fetchRemoteImage(`https://cdn.example/x.${kind}`)
    expect(url).toMatch(SAFE_DATA_URL)
    expect(url).toBe(`data:${type};base64,${bytes[kind].toString('base64')}`)
  })

  it('keeps the older fail-safes: non-2xx, non-image header, empty body, thrown fetch', async () => {
    stubFetch(bytes.png, 'image/png', 404)
    expect(await fetchRemoteImage('https://cdn.example/missing.png')).toBeNull()
    stubFetch(bytes.png, 'text/html')
    expect(await fetchRemoteImage('https://cdn.example/page')).toBeNull()
    stubFetch(Buffer.alloc(0), 'image/png')
    expect(await fetchRemoteImage('https://cdn.example/empty.png')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await fetchRemoteImage('https://cdn.example/reset.png')).toBeNull()
  })

  it('every value it can return is one Satori sizes', async () => {
    const out: string[] = []
    for (const [kind, body] of Object.entries(bytes)) {
      stubFetch(body, 'image/anything')
      const url = await fetchRemoteImage(`https://cdn.example/${kind}`)
      if (url) out.push(url)
    }
    expect(out.length).toBeGreaterThan(0)
    for (const url of out) expect(url).toMatch(SAFE_DATA_URL)
  })
})

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
