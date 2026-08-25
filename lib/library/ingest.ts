import 'server-only'
import { createHash } from 'node:crypto'

// The Loom — the SERVER half of the ingest pipeline (PROG-D1). One function every upload site calls
// with the bytes it is about to store: checksum → strip private metadata → read the pixel dimensions.
//
// 🔴 READ THIS BEFORE ADDING ANYTHING HERE. Nothing in this file decodes pixels, and that is a
// deliberate budget decision, not an oversight. Server-side pixel decode means `sharp`, `sharp`
// already reaches 67 functions of `check:og-trace`'s 100 budget, and this module is reachable from
// the Loom picker, the page editor, the importer and the email studio — four seams that fan out
// across most of the route table. Adding a decoder here is the 2026-08-11 ENOSPC fan-out one
// directory over (docs/DEPLOY-SAFETY.md). Everything below is byte-header parsing plus node:crypto,
// both of which cost ZERO traced bytes. The two things that genuinely need a decode — `blurhash`
// and `colors` — are computed in the BROWSER (lib/library/image-describe.ts) and travel in as data.

/** What ingest learned about one file, and the bytes that should actually be stored. */
export type IngestedImage = {
  /** The bytes to upload — identical to the input unless private metadata was stripped. */
  bytes: Uint8Array
  /** Hex sha256 of `bytes` (the STORED form), so dedupe compares what is really on disk. */
  sha256: string
  /** Pixel dimensions read from the file header, or null for a format we do not parse. */
  width: number | null
  height: number | null
  /** True when at least one private-metadata segment was removed. */
  strippedMetadata: boolean
  /** The EXIF orientation that was preserved (1–8), or null when the source carried none. */
  orientation: number | null
}

// ── Dimensions, from the container header only ──────────────────────────────────────────────────

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]

function ascii(b: Uint8Array, i: number, n: number): string {
  let s = ''
  for (let k = 0; k < n && i + k < b.length; k++) s += String.fromCharCode(b[i + k])
  return s
}

/** JPEG start-of-frame markers. Every one of them carries height then width at a fixed offset;
 *  the excluded 0xC4/0xC8/0xCC are Huffman/JPEG-LS tables that merely share the range. */
function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

/**
 * Pixel dimensions from a raster file's header — PNG, JPEG, GIF and WebP (lossy, lossless and
 * extended). PURE and total: an unparseable or truncated file returns null rather than throwing,
 * because a missing width must never fail an upload that would otherwise have worked.
 */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    if (bytes.length < 16) return null

    // PNG: 8-byte signature, then IHDR width/height as big-endian u32.
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
      const w = u32be(bytes, 16)
      const h = u32be(bytes, 20)
      return w > 0 && h > 0 ? { width: w, height: h } : null
    }

    // GIF87a / GIF89a: logical screen descriptor, little-endian u16.
    if (ascii(bytes, 0, 3) === 'GIF') {
      const w = u16le(bytes, 6)
      const h = u16le(bytes, 8)
      return w > 0 && h > 0 ? { width: w, height: h } : null
    }

    // RIFF/WEBP: three chunk flavours, three encodings of the same two numbers.
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      const chunk = ascii(bytes, 12, 4)
      if (chunk === 'VP8X' && bytes.length >= 30) {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
        return { width: w, height: h }
      }
      if (chunk === 'VP8 ' && bytes.length >= 30) {
        // Frame header: a 3-byte start code (0x9d 0x01 0x2a) then two 14-bit dimensions.
        if (bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
          const w = u16le(bytes, 26) & 0x3fff
          const h = u16le(bytes, 28) & 0x3fff
          return w > 0 && h > 0 ? { width: w, height: h } : null
        }
        return null
      }
      if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
        // 14 bits of (width-1) then 14 bits of (height-1), packed little-endian across 4 bytes.
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
        const w = (bits & 0x3fff) + 1
        const h = ((bits >>> 14) & 0x3fff) + 1
        return { width: w, height: h }
      }
      return null
    }

    // JPEG: walk the marker chain to the first start-of-frame.
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++
          continue
        }
        const marker = bytes[i + 1]
        if (marker === 0xff) {
          i++
          continue
        }
        // Standalone markers carry no length payload.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
          i += 2
          continue
        }
        const len = u16be(bytes, i + 2)
        if (len < 2) return null
        if (isSofMarker(marker)) {
          const h = u16be(bytes, i + 5)
          const w = u16be(bytes, i + 7)
          return w > 0 && h > 0 ? { width: w, height: h } : null
        }
        i += 2 + len
      }
      return null
    }

    return null
  } catch {
    return null
  }
}

// ── EXIF / IPTC / XMP strip, with orientation preserved ─────────────────────────────────────────

const EXIF_HEADER = 'Exif\0\0'
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0'
const ORIENTATION_TAG = 0x0112

/**
 * The EXIF orientation (1–8) inside an `Exif\0\0` APP1 payload, or null when absent/unreadable.
 * `payload` starts at the "Exif" bytes. PURE.
 */
export function readExifOrientation(payload: Uint8Array): number | null {
  try {
    if (ascii(payload, 0, 6) !== EXIF_HEADER) return null
    const tiff = 6
    const le = ascii(payload, tiff, 2) === 'II'
    if (!le && ascii(payload, tiff, 2) !== 'MM') return null
    const rd16 = (i: number) => (le ? u16le(payload, i) : u16be(payload, i))
    const rd32 = (i: number) =>
      le
        ? (payload[i] | (payload[i + 1] << 8) | (payload[i + 2] << 16) | (payload[i + 3] << 24)) >>> 0
        : u32be(payload, i)
    if (rd16(tiff + 2) !== 42) return null
    const ifd0 = tiff + rd32(tiff + 4)
    if (ifd0 + 2 > payload.length) return null
    const count = rd16(ifd0)
    for (let k = 0; k < count; k++) {
      const entry = ifd0 + 2 + k * 12
      if (entry + 12 > payload.length) return null
      if (rd16(entry) !== ORIENTATION_TAG) continue
      const value = rd16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
    return null
  } catch {
    return null
  }
}

/**
 * A minimal `Exif\0\0` APP1 payload carrying ONE tag: Orientation. 32 bytes, little-endian.
 *
 * WHY THIS EXISTS, and it is the hazard the backlog row never named: EXIF orientation is not
 * decoration. A phone camera writes the sensor's pixels unrotated and records "turn this 90°" in
 * the same APP1 block that holds GPS, the serial number and the timestamp. Delete the block and the
 * photo renders SIDEWAYS in every browser. So the strip is not "drop APP1" — it is "drop APP1 and
 * put the one non-private tag back".
 */
export function buildOrientationApp1(orientation: number): Uint8Array {
  const out = new Uint8Array(32)
  for (let i = 0; i < 6; i++) out[i] = EXIF_HEADER.charCodeAt(i)
  // TIFF header: little-endian, magic 42, IFD0 at offset 8.
  out[6] = 0x49; out[7] = 0x49
  out[8] = 42; out[9] = 0
  out[10] = 8; out[11] = 0; out[12] = 0; out[13] = 0
  // IFD0: one entry.
  out[14] = 1; out[15] = 0
  out[16] = ORIENTATION_TAG & 0xff; out[17] = ORIENTATION_TAG >> 8  // tag
  out[18] = 3; out[19] = 0                                          // type SHORT
  out[20] = 1; out[21] = 0; out[22] = 0; out[23] = 0                // count 1
  out[24] = orientation & 0xff; out[25] = 0                         // inline value
  out[26] = 0; out[27] = 0                                          // value padding
  out[28] = 0; out[29] = 0; out[30] = 0; out[31] = 0                // next IFD = none
  return out
}

/**
 * Remove the private-metadata segments from a JPEG: EXIF (APP1 `Exif\0\0` — GPS coordinates, the
 * camera serial, the capture timestamp), XMP (APP1 Adobe namespace) and Photoshop/IPTC (APP13). The
 * EXIF segment is REPLACED IN PLACE by `buildOrientationApp1` whenever the original declared a
 * rotation, so nothing renders sideways.
 *
 * DELIBERATELY KEPT: APP0 (JFIF density), APP2 `ICC_PROFILE` and APP14 `Adobe`. None carries
 * personal data and every one of them changes how the image DECODES — dropping the ICC profile
 * shifts colour, dropping the Adobe marker breaks YCCK/CMYK channel order.
 *
 * PURE and total. A non-JPEG, a truncated file or any parse surprise returns the input untouched:
 * a metadata strip must never be able to corrupt an upload.
 */
export function stripJpegMetadata(bytes: Uint8Array): {
  bytes: Uint8Array
  stripped: boolean
  orientation: number | null
} {
  const unchanged = { bytes, stripped: false, orientation: null as number | null }
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return unchanged

    const pieces: Uint8Array[] = [bytes.subarray(0, 2)]
    let orientation: number | null = null
    let stripped = false
    let i = 2

    while (i + 3 < bytes.length) {
      if (bytes[i] !== 0xff) return unchanged
      const marker = bytes[i + 1]
      // Start-of-scan / end-of-image: entropy-coded data to the end. Copy the remainder verbatim.
      if (marker === 0xda || marker === 0xd9) {
        pieces.push(bytes.subarray(i))
        break
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        pieces.push(bytes.subarray(i, i + 2))
        i += 2
        continue
      }
      const len = u16be(bytes, i + 2)
      if (len < 2 || i + 2 + len > bytes.length) return unchanged
      const payload = bytes.subarray(i + 4, i + 2 + len)

      const isExif = marker === 0xe1 && ascii(payload, 0, 6) === EXIF_HEADER
      const isXmp = marker === 0xe1 && ascii(payload, 0, XMP_HEADER.length) === XMP_HEADER
      const isPhotoshop = marker === 0xed

      if (isExif) {
        stripped = true
        orientation = readExifOrientation(payload)
        if (orientation !== null && orientation !== 1) {
          const minimal = buildOrientationApp1(orientation)
          const seg = new Uint8Array(minimal.length + 4)
          seg[0] = 0xff
          seg[1] = 0xe1
          seg[2] = ((minimal.length + 2) >> 8) & 0xff
          seg[3] = (minimal.length + 2) & 0xff
          seg.set(minimal, 4)
          pieces.push(seg)
        }
      } else if (isXmp || isPhotoshop) {
        stripped = true
      } else {
        pieces.push(bytes.subarray(i, i + 2 + len))
      }
      i += 2 + len
    }

    if (!stripped) return { bytes, stripped: false, orientation }

    let total = 0
    for (const p of pieces) total += p.length
    const out = new Uint8Array(total)
    let at = 0
    for (const p of pieces) {
      out.set(p, at)
      at += p.length
    }
    return { bytes: out, stripped: true, orientation }
  } catch {
    return unchanged
  }
}

// ── The one call every upload site makes ────────────────────────────────────────────────────────

/** Hex sha256 of the given bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Ingest one file's bytes: strip private metadata (JPEG only — the only format we ship that carries
 * an EXIF block), checksum the RESULT, and read the dimensions off the header. Total: any surprise
 * degrades to "the original bytes, hashed, with null dimensions", never a throw.
 *
 * Call this BEFORE the storage upload and store `result.bytes`, so the checksum describes the object
 * that actually exists and dedupe compares like with like.
 */
export function ingestImageBytes(input: Uint8Array, mime?: string | null): IngestedImage {
  const isJpeg = /jpe?g/i.test(mime ?? '') || (input.length > 2 && input[0] === 0xff && input[1] === 0xd8)
  const { bytes, stripped, orientation } = isJpeg
    ? stripJpegMetadata(input)
    : { bytes: input, stripped: false, orientation: null as number | null }
  const dims = readImageDimensions(bytes)
  return {
    bytes,
    sha256: sha256Hex(bytes),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    strippedMetadata: stripped,
    orientation,
  }
}
