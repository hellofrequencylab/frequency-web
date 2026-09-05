// Fetch a REMOTE, public image (a Supabase-hosted Space cover / logo) for a Satori OG render and
// return it as a base64 data URI. Satori cannot reliably load a bare remote `src`, so callers inline
// the bytes — the same way the root OG image inlines its local hero.jpg. FAIL-SAFE: returns null on
// ANY problem — a non-2xx response, a non-image content type, an oversized body (Satori's practical
// payload budget), or a slow origin (bounded by the timeout) — so a broken or huge upload can never
// crash or hang a crawler's card fetch; the caller falls back to its local placeholder.
//
// 2026-09-05 (scan2 L10 R5, LIVE-155): the paragraph above was not true for every image type, and
// the Space share card crashed on it. The old code trusted the origin's `content-type` header and
// emitted `data:<that type>;base64,...` for anything under `image/*`. Satori sizes a base64 data
// URL by its DECLARED type through a switch with cases for png, apng, gif and jpeg only; any other
// type (webp, avif, heic, a mislabelled upload) leaves its size variable unassigned and then spreads
// it: `[A, ...u2]`, which V8 reports as `TypeError: u2 is not iterable`. Reproduced against the
// shipped next/og bundle (node_modules/next/dist/compiled/@vercel/og/index.node.js, the data-URL
// branch of the image resolver) with a webp and an avif data URL. One live Space carries a
// `.webp` logo stored as `image/webp`; every other cover and logo in the database is jpeg, png or
// gif. A header that lies the other way (jpeg declared over png bytes) throws `Invalid JPEG` from
// the same resolver. So the type is now taken from the BYTES, never the header, and only the types
// Satori can size are emitted; everything else returns null and the caller's own fallback (the
// placeholder cover, the initials chip) carries the card.

const MAX_BYTES = 6 * 1024 * 1024
const TIMEOUT_MS = 3500

/** The image types Satori can size from a base64 data URL. Emitting any other declared type into a
 *  Satori `<img src>` crashes the render (see the header). */
export type InlineImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/svg+xml'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38]

// The same expressions Satori runs over an SVG data URL, so a file this module accepts is a file
// Satori can size: an `<svg>` tag with a 4-number viewBox, or a numeric width AND height.
const SVG_TAG = /<svg[^>]*>/i
const SVG_VIEWBOX = /viewBox=['"]([^'"]+)['"]/
const SVG_WIDTH = /width=['"](\d*\.?\d+)['"]/
const SVG_HEIGHT = /height=['"](\d*\.?\d+)['"]/

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false
  return magic.every((b, i) => bytes[i] === b)
}

/** Mirrors Satori's JPEG size walk: from the SOI marker, step through segments until a SOF0 / SOF1 /
 *  SOF2 frame header. Satori throws `Invalid JPEG` when the walk runs off the end or a segment length
 *  points past the buffer, so a file that fails here must not be inlined. */
function jpegHasFrameHeader(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = view.byteLength
  let offset = 4
  while (offset + 2 <= end) {
    const length = view.getUint16(offset, false)
    if (length > end) return false
    const markerAt = offset + length + 1
    if (markerAt >= end) return false
    const marker = view.getUint8(markerAt)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // Satori reads the height at +5 and the width at +7 past the marker's segment start.
      return offset + length + 9 <= end
    }
    offset += length + 2
  }
  return false
}

function svgIsSizeable(text: string): boolean {
  const tag = text.match(SVG_TAG)
  if (!tag) return false
  const open = tag[0]
  const viewBox = SVG_VIEWBOX.exec(open)
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/)
    if (parts.length === 4 && parts.every((p) => Number.isFinite(Number(p)))) return true
  }
  return SVG_WIDTH.test(open) && SVG_HEIGHT.test(open)
}

/** The image type of a byte buffer, decided from its magic bytes and restricted to the types Satori
 *  can size from a base64 data URL; null for anything else (webp, avif, heic, bmp, tiff, ico, an
 *  unparseable jpeg, an svg with no dimensions, or bytes that are not an image at all). PURE. */
export function sniffInlineImageType(buf: ArrayBuffer): InlineImageType | null {
  const bytes = new Uint8Array(buf)
  if (bytes.byteLength === 0) return null
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png'
  if (startsWith(bytes, GIF_MAGIC)) return 'image/gif'
  if (startsWith(bytes, JPEG_MAGIC)) return jpegHasFrameHeader(bytes) ? 'image/jpeg' : null
  // SVG is text: an optional UTF-8 BOM, then whitespace, then `<?xml` or `<svg`. Only decode when
  // the first byte says text, so a multi-megabyte photo is never stringified.
  const first = bytes[0]
  if (first === 0x3c || first === 0xef || first === 0x20 || first === 0x0a || first === 0x0d || first === 0x09) {
    const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').trimStart()
    if ((text.startsWith('<?xml') || text.startsWith('<svg')) && svgIsSizeable(text)) return 'image/svg+xml'
  }
  return null
}

export async function fetchRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    // The declared type comes from the bytes, never from the header (see the header comment).
    const sniffed = sniffInlineImageType(buf)
    if (!sniffed) return null
    return `data:${sniffed};base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return null
  }
}
