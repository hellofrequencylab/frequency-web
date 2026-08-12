// BROWSER-side image downscaling for uploads. Shared by every uploader that posts a file through a
// server action (the Loom picker, the business-seeder stager), because those go through a Vercel
// serverless function whose request-body limit (~4.5 MB) sits UNDER next.config's serverActions
// .bodySizeLimit. A body over the platform limit is rejected with a 413 BEFORE the action runs — a
// thrown server action — so a big phone photo (a 7–12 MB JPEG is routine) must be shrunk client-side
// first or it never uploads. Empirically no upload above ~3.6 MB has ever landed, so we keep the whole
// multipart body comfortably under the limit.
//
// This module only runs in the browser (it uses createImageBitmap/canvas), but references those globals
// only INSIDE functions, so importing it is SSR-safe. FAIL-SAFE throughout: any decode/encode failure
// returns the ORIGINAL file so the upload still attempts with what we have.
//
// It is ALSO the one seam that makes iPhone HEIC photos uploadable (prepareImageForUpload): only Safari
// can decode HEIC, so a raw .heic that reaches Storage renders as a broken tile in every other browser
// (the picker grid, the crop/focus preview, the avatar). Every uploader should call prepareImageForUpload
// instead of shrinkImageForUpload directly: it converts HEIC/HEIF to JPEG in the browser FIRST (native
// decode where the browser can, else the decoder behind lib/library/heic-decode.ts), then runs the same
// downscale, so size limits apply to the CONVERTED file.
//
// ⚠️ NOTHING HEAVY MAY BE IMPORTED HERE. Two dozen uploaders import this module, Next server-renders
// every one of them, and @vercel/nft copies whatever it can reach into all of their functions. The
// wasm decoder used to be named right here and cost 1.29MB x 381 functions = 491MB of the build's disk
// budget (ADR-1002 follow-up, docs/DEPLOY-SAFETY.md rule 2). It now sits behind its own module, which
// next.config.ts excludes from the server traces. Keep it that way.

import { effectiveMime } from '@/lib/library/upload-kinds'

/** Hard ceiling for a single file's upload body, kept under Vercel's ~4.5 MB serverless body limit. A
 *  file still over this after shrinking must be skipped (the caller surfaces a clear message). */
export const SERVER_MAX_BYTES = Math.round(4.3 * 1024 * 1024)
/** What the downscale AIMS to get under (leaves headroom below SERVER_MAX_BYTES for multipart overhead). */
export const SHRINK_TARGET_BYTES = Math.round(3.5 * 1024 * 1024)

// Progressive (longest-edge, JPEG-quality) steps. 2560px is ample for a full-bleed header; each step down
// trades a little resolution/quality to guarantee even a dense 12–50MP phone photo lands under the target.
const SHRINK_STEPS: readonly [number, number][] = [
  [2560, 0.85],
  [2048, 0.8],
  [1600, 0.72],
  [1280, 0.68],
]

/** The encode target for a shrink. JPEG is smaller, but it has NO ALPHA CHANNEL, so it may only be
 *  used for a source that has none. See `pickEncodeType`. */
type EncodeType = 'image/jpeg' | 'image/webp'

/**
 * Whether the decoded image actually carries a TRANSPARENT pixel. Reads the alpha channel rather than
 * trusting the file type, because most PNGs are fully opaque and would needlessly lose JPEG's better
 * compression if we assumed otherwise.
 *
 * Cost control: the scan runs on a downscaled copy (at most SCAN_DIM on the long edge), so it is a few
 * hundred KB of reads regardless of whether the source is 1 MP or 50 MP.
 *
 * FAIL-SAFE, and note which way: any failure (a tainted canvas, no 2d context) returns TRUE, i.e. it
 * assumes transparency and takes the lossless-alpha path. Guessing "opaque" wrongly destroys an image;
 * guessing "transparent" wrongly only costs a few KB.
 */
function hasTransparentPixels(bitmap: ImageBitmap): boolean {
  const SCAN_DIM = 256
  try {
    const scale = Math.min(1, SCAN_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return true
    ctx.drawImage(bitmap, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true
    }
    return false
  } catch {
    return true
  }
}

/**
 * The format to re-encode into. WebP whenever the source has any transparency (it keeps the alpha
 * channel and is still far smaller than PNG); JPEG otherwise.
 *
 * WHY THIS EXISTS: this function used to encode unconditionally to JPEG. A transparent PNG over the
 * shrink threshold was therefore flattened onto the canvas's transparent black, arriving as a photo on
 * a BLACK background, and the owner reasonably concluded the export was at fault. The image never had
 * a chance: the alpha was destroyed in the browser before the upload ever started.
 */
function pickEncodeType(bitmap: ImageBitmap): EncodeType {
  return hasTransparentPixels(bitmap) ? 'image/webp' : 'image/jpeg'
}

/** The file extension for an encode target. Exported so the naming can be pinned in a unit test
 *  without a browser (the encode itself needs a real canvas). PURE. */
export function encodeTypeExtension(type: EncodeType): 'webp' | 'jpg' {
  return type === 'image/webp' ? 'webp' : 'jpg'
}

async function encodeAt(
  bitmap: ImageBitmap,
  maxDim: number,
  quality: number,
  type: EncodeType = 'image/jpeg',
): Promise<Blob | null> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Best-effort browser-side downscale so a photo fits under the upload ceiling (and uploads faster). Only
 * touches raster formats this browser can decode (JPEG/PNG/WebP) that are actually over the target; SVG/
 * GIF/HEIC and already-small files pass through untouched (HEIC can't be canvas-decoded in Chrome). Steps
 * DOWN through SHRINK_STEPS until the re-encoded JPEG is under SHRINK_TARGET_BYTES, keeping the smallest
 * result. Returns the ORIGINAL file on any failure or if re-encoding wouldn't help.
 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  const decodable = /^image\/(jpeg|png|webp)$/i.test(file.type)
  if (!decodable || file.size <= SHRINK_TARGET_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    // Choose the format BEFORE encoding: a source with any transparency must not become a JPEG.
    const type = pickEncodeType(bitmap)
    let best: Blob | null = null
    for (const [maxDim, quality] of SHRINK_STEPS) {
      const blob = await encodeAt(bitmap, maxDim, quality, type)
      if (blob && blob.size > 0 && (!best || blob.size < best.size)) best = blob
      if (best && best.size <= SHRINK_TARGET_BYTES) break
    }
    bitmap.close?.()
    if (!best || best.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    const ext = encodeTypeExtension(type)
    return new File([best], `${base}.${ext}`, { type })
  } catch {
    return file
  }
}

// ── HEIC/HEIF → JPEG (iPhone camera-roll photos) ────────────────────────────────────────────────

// image/heic, image/heif, and the burst "-sequence" variants. Matched against effectiveMime so a
// blank browser-reported type is recovered from the .heic/.heif extension first.
const HEIC_MIME = /^image\/hei[cf]/

/** Whether this file is an iPhone HEIC/HEIF photo (by MIME, or by extension when the type is blank). */
export function isHeicFile(file: File): boolean {
  return HEIC_MIME.test(effectiveMime(file.type, file.name))
}

/** Plain-language inline message for a HEIC that could not be converted in this browser. */
export const HEIC_CONVERT_FAILED_MESSAGE =
  'That photo could not be converted for upload. Save it as a JPEG and try again.'

// The conversion target: ample for a full-bleed header, and shrinkImageForUpload re-shrinks the JPEG
// afterwards if it still lands over the upload target.
const HEIC_ENCODE_MAX_DIM = 2560
const HEIC_ENCODE_QUALITY = 0.9

/** Decode a HEIC and re-encode it as a JPEG blob, or null when this browser genuinely cannot. */
async function heicToJpegBlob(file: File): Promise<Blob | null> {
  // Native decode first: Safari reads HEIC itself, so it skips downloading the conversion library.
  try {
    const bitmap = await createImageBitmap(file)
    const blob = await encodeAt(bitmap, HEIC_ENCODE_MAX_DIM, HEIC_ENCODE_QUALITY)
    bitmap.close?.()
    if (blob && blob.size > 0) return blob
  } catch {
    // Not natively decodable here (Chrome/Firefox/Edge) — fall through to the library.
  }
  // The wasm decoder, behind its own client-only boundary (lib/library/heic-decode.ts). The dynamic
  // import keeps it out of the main browser bundle — it downloads the first time someone actually
  // picks a HEIC in a browser that cannot decode one — and the boundary keeps it out of the server
  // traces, which is a separate and much more expensive problem. Read that file before changing this
  // line: the specifier is what the tracing exclude keys on.
  try {
    const { decodeHeicToJpeg } = await import('./heic-decode')
    return await decodeHeicToJpeg(file, HEIC_ENCODE_QUALITY)
  } catch {
    return null
  }
}

/**
 * The ONE prep step every image uploader should run before posting a file: converts an iPhone
 * HEIC/HEIF to JPEG (so the stored image renders everywhere, including the crop/focus preview), then
 * downscales big photos via shrinkImageForUpload. Size gates in the caller therefore apply to the
 * CONVERTED file. Returns an inline-ready `error` when a HEIC cannot be converted in this browser —
 * uploading it raw would only store an image most browsers cannot display.
 */
export async function prepareImageForUpload(raw: File): Promise<{ file: File } | { error: string }> {
  let file = raw
  if (isHeicFile(raw)) {
    const blob = await heicToJpegBlob(raw)
    if (!blob) return { error: HEIC_CONVERT_FAILED_MESSAGE }
    const base = raw.name.replace(/\.[^.]+$/, '') || 'photo'
    file = new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  }
  return { file: await shrinkImageForUpload(file) }
}
