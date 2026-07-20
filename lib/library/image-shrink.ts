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
