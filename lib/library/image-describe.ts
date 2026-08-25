// The Loom — the BROWSER half of ingest. Everything here needs decoded pixels, and decoding pixels
// on the server means `sharp`.
//
// 🔴 WHY THIS RUNS IN THE BROWSER. `sharp` already reaches 67 functions of `check:og-trace`'s 100
// budget, and the Loom write path is reachable from the picker, the page editor, the importer and
// the email studio. Pulling a decoder into that seam multiplies across most of the route table —
// the exact fan-out shape behind the 2026-08-11 ENOSPC incident (docs/DEPLOY-SAFETY.md). The
// browser, meanwhile, has ALREADY decoded the file: the uploader is looking at it. So the blurhash
// and the colour palette are computed here, next to lib/library/image-shrink.ts, and travel to the
// server as three small form fields. The server validates them (they arrive from a client, so they
// are untrusted) and never computes them.
//
// ⚠️ NOTHING HEAVY MAY BE IMPORTED HERE — the same rule image-shrink.ts carries, for the same
// reason. `./blurhash` is pure arithmetic with no imports of its own; keep it that way.

import { encodeBlurhash, isValidBlurhash } from './blurhash'

/** What the browser can say about an image that the server cannot cheaply learn. */
export type ImageDescriptor = {
  /** The SOURCE file's dimensions, before any upload downscale — `library_assets.orig_*`. */
  origWidth: number
  origHeight: number
  /** BlurHash placeholder, or null when the decode failed. */
  blurhash: string | null
  /** Dominant colours as `#rrggbb`, most prominent first. */
  colors: string[]
}

/** The form-field names the descriptor travels under. One constant, so the writer and the reader
 *  cannot drift apart. */
export const DESCRIPTOR_FIELDS = {
  blurhash: 'blurhash',
  colors: 'colors',
  origWidth: 'origWidth',
  origHeight: 'origHeight',
} as const

/** The long edge the analysis thumbnail is drawn at. Small on purpose: BlurHash is a 4×3 cosine
 *  transform, so more pixels buy nothing, and the palette is a histogram. */
const ANALYSIS_DIM = 64

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/**
 * The dominant colours of an RGBA buffer, as `#rrggbb`, most prominent first.
 *
 * A 4×4×4 histogram (64 coarse bins) counts where the pixels live, then each winning bin reports the
 * MEAN of the actual pixels inside it rather than the bin's centre — so a photo of one blue sky
 * returns that sky's blue, not a rounded-off approximation of it. Near-transparent pixels are
 * skipped: a logo on a transparent background must not report the canvas colour.
 *
 * PURE. Returns [] for malformed input.
 */
export function dominantColors(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  count = 5,
): string[] {
  if (pixels.length !== width * height * 4 || width < 1 || height < 1) return []
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p + 3] < 128) continue
    const r = pixels[p]
    const g = pixels[p + 1]
    const b = pixels[p + 2]
    const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)
    const bin = bins.get(key)
    if (bin) {
      bin.n++
      bin.r += r
      bin.g += g
      bin.b += b
    } else {
      bins.set(key, { n: 1, r, g, b })
    }
  }
  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(0, count))
    .map((bin) => `#${hex2(Math.round(bin.r / bin.n))}${hex2(Math.round(bin.g / bin.n))}${hex2(Math.round(bin.b / bin.n))}`)
}

/**
 * Describe an image FILE in the browser: its true dimensions, a BlurHash and a colour palette.
 *
 * FAIL-SAFE in one direction only — every failure path returns null and the upload proceeds without
 * the extras. Placeholder metadata is a nicety; refusing an upload over it would not be.
 *
 * Only runs in a browser (createImageBitmap/canvas), but touches those globals INSIDE the function,
 * so importing this module stays SSR-safe.
 */
export async function describeImage(file: File): Promise<ImageDescriptor | null> {
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) return null
  try {
    const bitmap = await createImageBitmap(file)
    const origWidth = bitmap.width
    const origHeight = bitmap.height
    const scale = Math.min(1, ANALYSIS_DIM / Math.max(origWidth, origHeight))
    const w = Math.max(1, Math.round(origWidth * scale))
    const h = Math.max(1, Math.round(origHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bitmap.close?.()
      return { origWidth, origHeight, blurhash: null, colors: [] }
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const { data } = ctx.getImageData(0, 0, w, h)
    // More horizontal components for a landscape image, more vertical for a portrait one.
    const landscape = w >= h
    const blurhash = encodeBlurhash(data, w, h, landscape ? 4 : 3, landscape ? 3 : 4)
    return { origWidth, origHeight, blurhash, colors: dominantColors(data, w, h) }
  } catch {
    return null
  }
}

/** Attach a descriptor to the FormData an uploader is about to post. A null descriptor is a no-op,
 *  so a caller never has to branch. */
export function appendImageDescriptor(form: FormData, descriptor: ImageDescriptor | null): void {
  if (!descriptor) return
  if (descriptor.blurhash) form.set(DESCRIPTOR_FIELDS.blurhash, descriptor.blurhash)
  if (descriptor.colors.length) form.set(DESCRIPTOR_FIELDS.colors, descriptor.colors.join(','))
  form.set(DESCRIPTOR_FIELDS.origWidth, String(descriptor.origWidth))
  form.set(DESCRIPTOR_FIELDS.origHeight, String(descriptor.origHeight))
}

/** The parsed, VALIDATED descriptor fields on a posted form. */
export type IncomingDescriptor = {
  blurhash: string | null
  colors: string[] | null
  origWidth: number | null
  origHeight: number | null
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * Read the descriptor back off a posted form, dropping anything malformed.
 *
 * These four fields are the ONLY part of ingest a client supplies, so they are treated the way any
 * client input is: the blurhash must satisfy its own structural grammar, colours must be `#rrggbb`
 * and are capped at 8, and dimensions must be sane positive integers. Nothing here is a security
 * boundary on its own — the values are cosmetic — but "cosmetic" is not a reason to write junk into
 * the catalog, and an unvalidated colour string is one `style` binding away from mattering.
 */
export function readImageDescriptor(form: FormData): IncomingDescriptor {
  const rawHash = form.get(DESCRIPTOR_FIELDS.blurhash)
  const rawColors = form.get(DESCRIPTOR_FIELDS.colors)
  const int = (key: string): number | null => {
    const raw = form.get(key)
    if (typeof raw !== 'string') return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : null
  }
  const colors =
    typeof rawColors === 'string'
      ? rawColors
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c) => HEX_COLOR.test(c))
          .slice(0, 8)
      : []
  return {
    blurhash: isValidBlurhash(rawHash) ? rawHash : null,
    colors: colors.length ? colors : null,
    origWidth: int(DESCRIPTOR_FIELDS.origWidth),
    origHeight: int(DESCRIPTOR_FIELDS.origHeight),
  }
}
