import { describe, it, expect } from 'vitest'
import {
  ingestImageBytes,
  readImageDimensions,
  readExifOrientation,
  sha256Hex,
  stripJpegMetadata,
} from './ingest'

// The SERVER half of Loom ingest (PROG-D1). Everything here is byte-level, because everything here
// deliberately avoids a pixel decode — see the header of ingest.ts for why `sharp` is not an option
// in this seam. The properties under test are the ones that would be expensive to get wrong:
//
//   1. The EXIF strip removes the PRIVATE data and KEEPS the orientation. Dropping APP1 wholesale is
//      the obvious implementation and it renders every phone photo sideways.
//   2. It keeps the segments that change how the file DECODES (ICC, Adobe) while dropping the ones
//      that only describe the photographer (Exif, XMP, Photoshop/IPTC).
//   3. It is byte-exact when there is nothing to strip, so an unchanged upload stays unchanged.
//   4. The checksum is over the STORED bytes, so dedupe compares what is on disk.
//   5. Dimensions come off the container header for every format the Loom accepts.

// ── Byte builders ───────────────────────────────────────────────────────────────────────────────

function bytes(...parts: (number[] | Uint8Array | string)[]): Uint8Array {
  const flat: number[] = []
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) flat.push(ch.charCodeAt(0))
    else for (const b of p) flat.push(b)
  }
  return new Uint8Array(flat)
}

/** An APP segment: marker, 2-byte big-endian length (payload + 2), payload. */
function segment(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2
  return bytes([0xff, marker, (len >> 8) & 0xff, len & 0xff], payload)
}

const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff]
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]

const GPS_SECRET = 'GPS:51.5074\0'

/**
 * A real-shaped EXIF APP1 payload: IFD0 with Orientation = `orientation` and a Make tag whose value
 * is a recognisable secret stored out-of-line. The secret is the assertion target — it is what a
 * phone photo's APP1 really carries (coordinates, a serial number, a timestamp).
 */
function exifPayload(orientation: number): Uint8Array {
  const DATA_AT = 38
  return bytes(
    'Exif\0\0',
    'II', u16le(42), u32le(8),          // TIFF header, little-endian, IFD0 at 8
    u16le(2),                            // two entries
    u16le(0x0112), u16le(3), u32le(1), u16le(orientation), [0, 0],
    u16le(0x010f), u16le(2), u32le(GPS_SECRET.length), u32le(DATA_AT),
    u32le(0),                            // no next IFD
    GPS_SECRET,
  )
}

/** A minimal but structurally valid JPEG, optionally carrying metadata segments. */
function jpeg(opts: { orientation?: number; xmp?: boolean; photoshop?: boolean; icc?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = [bytes([0xff, 0xd8])]
  parts.push(segment(0xe0, bytes('JFIF\0', [1, 1, 0], u16le(72), u16le(72), [0, 0])))
  if (opts.orientation !== undefined) parts.push(segment(0xe1, exifPayload(opts.orientation)))
  if (opts.xmp) parts.push(segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', '<x:xmpmeta author="someone"/>')))
  if (opts.photoshop) parts.push(segment(0xed, bytes('Photoshop 3.0\0', [0x38, 0x42, 0x49, 0x4d], 'IPTC-CREDIT')))
  if (opts.icc) parts.push(segment(0xe2, bytes('ICC_PROFILE\0', [1, 1], 'ICCBODY')))
  // SOF0: precision 8, height 480, width 640, 1 component.
  parts.push(segment(0xc0, bytes([8], [480 >> 8, 480 & 0xff], [640 >> 8, 640 & 0xff], [1], [1, 0x11, 0])))
  // SOS + entropy-coded data + EOI.
  parts.push(segment(0xda, bytes([1], [1, 0], [0, 63, 0])))
  parts.push(bytes([0x12, 0x34, 0x56, 0x78], [0xff, 0xd9]))
  return bytes(...parts)
}

const text = (b: Uint8Array) => Array.from(b, (n) => String.fromCharCode(n)).join('')

// ── The strip ───────────────────────────────────────────────────────────────────────────────────

describe('stripJpegMetadata removes what is private and keeps what is structural', () => {
  it('drops the EXIF body but re-emits the orientation, on a rotation-6 photo', () => {
    const source = jpeg({ orientation: 6, icc: true })
    expect(text(source)).toContain('GPS:51.5074')

    const out = stripJpegMetadata(source)

    expect(out.stripped).toBe(true)
    expect(out.orientation).toBe(6)
    // The private payload is gone …
    expect(text(out.bytes)).not.toContain('GPS:51.5074')
    // … and the rotation survived, readable through the very parser that reads a camera's.
    const app1 = out.bytes.indexOf(0xe1)
    expect(app1).toBeGreaterThan(0)
    expect(readExifOrientation(out.bytes.subarray(app1 + 3))).toBe(6)
  })

  it('keeps the ICC profile, and drops XMP and Photoshop/IPTC', () => {
    const out = stripJpegMetadata(jpeg({ orientation: 3, xmp: true, photoshop: true, icc: true }))
    const s = text(out.bytes)
    expect(s).toContain('ICC_PROFILE')   // changes how the image DECODES — never dropped
    expect(s).toContain('JFIF')          // ditto
    expect(s).not.toContain('xmpmeta')
    expect(s).not.toContain('IPTC-CREDIT')
    expect(s).not.toContain('GPS:51.5074')
  })

  it('does NOT re-emit an APP1 when the orientation was already upright', () => {
    // Orientation 1 means "no rotation", so the segment would carry nothing worth 34 bytes.
    const out = stripJpegMetadata(jpeg({ orientation: 1 }))
    expect(out.stripped).toBe(true)
    expect(out.orientation).toBe(1)
    expect(text(out.bytes)).not.toContain('Exif')
  })

  it('is byte-identical when there is nothing private to remove', () => {
    const source = jpeg({ icc: true })
    const out = stripJpegMetadata(source)
    expect(out.stripped).toBe(false)
    expect(out.bytes).toBe(source)
  })

  it('leaves the image data itself intact', () => {
    const out = stripJpegMetadata(jpeg({ orientation: 8, photoshop: true }))
    // The frame header still parses, at the same dimensions …
    expect(readImageDimensions(out.bytes)).toEqual({ width: 640, height: 480 })
    // … and the entropy-coded scan plus its EOI are still the tail.
    const tail = out.bytes.subarray(out.bytes.length - 6)
    expect(Array.from(tail)).toEqual([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9])
  })

  it('returns the input untouched for anything it cannot parse', () => {
    for (const input of [
      new Uint8Array([1, 2, 3]),                                    // too short
      bytes([0x89, 0x50, 0x4e, 0x47], 'not a jpeg at all'),         // not a JPEG
      jpeg({ orientation: 6 }).subarray(0, 20),                     // truncated mid-segment
    ]) {
      const out = stripJpegMetadata(input)
      expect(out.stripped).toBe(false)
      expect(out.bytes).toBe(input)
    }
  })
})

describe('readExifOrientation', () => {
  it('reads a little-endian IFD0', () => {
    expect(readExifOrientation(exifPayload(6))).toBe(6)
  })
  it('rejects a payload that is not an Exif block, and out-of-range values', () => {
    expect(readExifOrientation(bytes('Not exif at all'))).toBeNull()
    expect(readExifOrientation(exifPayload(99))).toBeNull()
  })
})

// ── Dimensions ──────────────────────────────────────────────────────────────────────────────────

describe('readImageDimensions covers every format the Loom accepts', () => {
  it('PNG', () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      [0, 0, 0, 13], 'IHDR',
      [0, 0, 0x03, 0x20],   // 800
      [0, 0, 0x02, 0x58],   // 600
      [8, 6, 0, 0, 0],
    )
    expect(readImageDimensions(png)).toEqual({ width: 800, height: 600 })
  })

  it('JPEG, past the segments that precede the frame header', () => {
    expect(readImageDimensions(jpeg({ orientation: 6, icc: true }))).toEqual({ width: 640, height: 480 })
  })

  it('GIF', () => {
    expect(readImageDimensions(bytes('GIF89a', u16le(320), u16le(240), [0xf7, 0, 0, 0, 0, 0, 0, 0]))).toEqual({
      width: 320,
      height: 240,
    })
  })

  it('WebP — lossy, lossless and extended', () => {
    const riff = (chunk: string, body: Uint8Array) =>
      bytes('RIFF', u32le(body.length + 12), 'WEBP', chunk, u32le(body.length), body)

    // VP8 (lossy): 3 frame-tag bytes, the 0x9d012a start code, then two 14-bit dimensions.
    expect(
      readImageDimensions(riff('VP8 ', bytes([0, 0, 0], [0x9d, 0x01, 0x2a], u16le(256), u16le(128), [0, 0, 0, 0]))),
    ).toEqual({ width: 256, height: 128 })

    // VP8L (lossless): signature 0x2f, then (w-1) and (h-1) packed 14 bits each.
    const packed = (200 - 1) | ((100 - 1) << 14)
    expect(readImageDimensions(riff('VP8L', bytes([0x2f], u32le(packed), [0, 0, 0, 0])))).toEqual({
      width: 200,
      height: 100,
    })

    // VP8X (extended): 24-bit little-endian (w-1), (h-1).
    const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
    expect(
      readImageDimensions(riff('VP8X', bytes([0x10, 0, 0, 0], u24le(1919), u24le(1079), [0, 0, 0, 0]))),
    ).toEqual({ width: 1920, height: 1080 })
  })

  it('returns null rather than throwing on junk', () => {
    expect(readImageDimensions(new Uint8Array(4))).toBeNull()
    expect(readImageDimensions(bytes('this is a text file, not an image at all'))).toBeNull()
  })
})

// ── The pipeline ────────────────────────────────────────────────────────────────────────────────

describe('ingestImageBytes', () => {
  it('hashes the STORED bytes, not the submitted ones', () => {
    const source = jpeg({ orientation: 6 })
    const result = ingestImageBytes(source, 'image/jpeg')

    expect(result.strippedMetadata).toBe(true)
    expect(result.bytes.byteLength).toBeLessThan(source.byteLength)
    // The whole point of hashing late: the checksum describes the object on disk.
    expect(result.sha256).toBe(sha256Hex(result.bytes))
    expect(result.sha256).not.toBe(sha256Hex(source))
    expect(result).toMatchObject({ width: 640, height: 480, orientation: 6 })
  })

  it('DEDUPES ACROSS METADATA: two exports of one photo that differ only in EXIF hash the same', () => {
    // This is the property that makes checksum dedupe useful rather than theatrical. The same
    // picture re-saved by a different app carries a different APP1 and would otherwise never match.
    const a = ingestImageBytes(jpeg({ orientation: 6 }), 'image/jpeg')
    const b = ingestImageBytes(jpeg({ orientation: 6, xmp: true, photoshop: true }), 'image/jpeg')
    expect(a.sha256).toBe(b.sha256)

    // …and a genuinely different picture still does not collide.
    const different = ingestImageBytes(bytes(jpeg(), [0x00]), 'image/jpeg')
    expect(different.sha256).not.toBe(a.sha256)
  })

  it('passes a non-JPEG through untouched, and still measures it', () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      [0, 0, 0, 13], 'IHDR', [0, 0, 0x01, 0x00], [0, 0, 0x00, 0x80], [8, 6, 0, 0, 0],
    )
    const result = ingestImageBytes(png, 'image/png')
    expect(result.bytes).toBe(png)
    expect(result.strippedMetadata).toBe(false)
    expect(result).toMatchObject({ width: 256, height: 128 })
  })

  it('never throws, and always returns a usable checksum', () => {
    const junk = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02])
    const result = ingestImageBytes(junk, 'image/jpeg')
    expect(result.sha256).toHaveLength(64)
    expect(result.width).toBeNull()
  })

  it('detects a JPEG by its magic bytes when the MIME is missing or wrong', () => {
    // Browsers routinely post a blank File.type for a camera-roll photo.
    expect(ingestImageBytes(jpeg({ orientation: 6 }), '').strippedMetadata).toBe(true)
    expect(ingestImageBytes(jpeg({ orientation: 6 }), 'application/octet-stream').strippedMetadata).toBe(true)
  })
})
