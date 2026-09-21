// Native rotate for the Loom image editor (HYG-109, ADR-1506). Canvas 2D only: no konva, no
// styled-components, no @scaleflex. The owner's 2026-09-21 ruling picked this over Filerobot once
// its install was measured (~6.8 MB across seven packages, two pinned at a beta, one a second
// styling runtime), and rotate is the one operation the kit's ImageCropper did not already have.
//
// Browser-only (Image + <canvas>); the editor injects it as a seam so a jsdom test can stand in a
// fake and drive the loading / error states without a canvas.

/** Degrees the straighten slider may reach either way. Quarter turns stack on top. */
export const STRAIGHTEN_LIMIT = 15

/** Normalise any angle to [0, 360). */
export function normalizeDegrees(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

/** The bounding box of a w×h image rotated by `deg` degrees, rounded to whole pixels. */
export function rotatedBounds(w: number, h: number, deg: number): { w: number; h: number } {
  const rad = (normalizeDegrees(deg) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return { w: Math.max(1, Math.round(w * cos + h * sin)), h: Math.max(1, Math.round(w * sin + h * cos)) }
}

export type BakedSource = { src: string; revoke: () => void }

/** A function that turns the master url + an angle into a source the cropper can load. */
export type RotationBaker = (url: string, degrees: number, mime: string | null) => Promise<BakedSource>

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('empty image')))
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = url
  })
}

/**
 * Draw the image rotated by `degrees` onto an offscreen canvas sized to the rotated bounding box
 * and hand back an object URL the cropper can load. 0° short-circuits to the master url (no canvas,
 * no copy). PNG/WebP masters keep transparency in the corners a non-quarter turn exposes; a JPEG
 * master gets those corners on the canvas's transparent black, which the crop that follows removes.
 * Throws on a tainted canvas or a missing 2D context, and the editor renders that as its error state.
 */
export const rotateImageToObjectUrl: RotationBaker = async (url, degrees, mime) => {
  const deg = normalizeDegrees(degrees)
  if (deg === 0) return { src: url, revoke: () => {} }
  const img = await loadImage(url)
  const { w, h } = rotatedBounds(img.naturalWidth, img.naturalHeight, deg)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.translate(w / 2, h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  const type = mime === 'image/png' || mime === 'image/webp' ? mime : 'image/png'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type))
  if (!blob) throw new Error('rotate produced no bytes')
  const src = URL.createObjectURL(blob)
  return { src, revoke: () => URL.revokeObjectURL(src) }
}

/** Pixel size of a produced image file, for the library row's width/height. Null when the browser
 *  cannot decode it here; the server keeps the previous numbers in that case. */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null
    const bmp = await createImageBitmap(file)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  } catch {
    return null
  }
}
