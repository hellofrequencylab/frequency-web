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
// decode where the browser can, else heic2any, dynamic-imported so it never ships in the main bundle),
// then runs the same downscale, so size limits apply to the CONVERTED file.

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

async function encodeAt(bitmap: ImageBitmap, maxDim: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
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
    let best: Blob | null = null
    for (const [maxDim, quality] of SHRINK_STEPS) {
      const blob = await encodeAt(bitmap, maxDim, quality)
      if (blob && blob.size > 0 && (!best || blob.size < best.size)) best = blob
      if (best && best.size <= SHRINK_TARGET_BYTES) break
    }
    bitmap.close?.()
    if (!best || best.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([best], `${base}.jpg`, { type: 'image/jpeg' })
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
  // heic2any (libheif in wasm). Dynamic import keeps it out of the main bundle: it only downloads the
  // first time someone actually picks a HEIC in a browser that cannot decode one.
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: HEIC_ENCODE_QUALITY })
    const blob = Array.isArray(out) ? out[0] : out
    return blob && blob.size > 0 ? blob : null
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
