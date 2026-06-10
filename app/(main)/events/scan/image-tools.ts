// On-device image pipeline for the poster capture flow (browser only — every
// function here touches canvas). The capture principles: downscale BEFORE
// upload (one cheap vision call), deskew + crop entirely on the client (we
// never process images server-side). The perspective math lives in
// lib/events/homography.ts so it stays unit-testable.

import {
  solveHomography,
  applyHomography,
  mapBoxThroughHomography,
  type Mat3,
} from '@/lib/events/homography'
import type { CornerPoint, ImageBox } from '@/lib/events/types'

export { mapBoxThroughHomography }
export type { Mat3 }

export function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')) }
    img.src = url
  })
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality),
  )
}

/** Downscale the longest side to ~1024 + jpeg-compress BEFORE upload — cheaper
 *  and faster for the vision model than a full-resolution phone photo. */
export async function downscaleForScan(file: File, maxDim = 1024, quality = 0.8): Promise<Blob> {
  const img = await fileToImage(file)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvasToJpeg(canvas, quality)
}

/** Crop a normalized box out of a source canvas/image into a jpeg, downscaled
 *  to `maxDim` on the longest side. Falls back to the full frame when the box
 *  is missing. */
export async function cropBoxToJpeg(
  source: HTMLCanvasElement | HTMLImageElement,
  box: ImageBox | null,
  maxDim = 800,
  quality = 0.82,
): Promise<Blob> {
  const sw = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth
  const sh = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 }
  const sx = Math.round(b.x * sw)
  const sy = Math.round(b.y * sh)
  const cw = Math.max(1, Math.round(b.w * sw))
  const ch = Math.max(1, Math.round(b.h * sh))
  const scale = Math.min(1, maxDim / Math.max(cw, ch))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cw * scale))
  canvas.height = Math.max(1, Math.round(ch * scale))
  canvas.getContext('2d')!.drawImage(source, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas, quality)
}

export interface DeskewResult {
  /** The squared, auto-contrasted poster. */
  canvas: HTMLCanvasElement
  /** Homography mapping normalized ORIGINAL-photo coords → normalized deskewed
   *  coords, for carrying the model's crop boxes onto the squared image. */
  toDeskewed: Mat3
}

const UNIT_SQUARE: CornerPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

/**
 * Perspective-warp the poster (located by the model's four normalized corners,
 * in [top-left, top-right, bottom-right, bottom-left] order) into a squared
 * image, then apply a light auto-contrast. Pure canvas: an inverse-mapped
 * bilinear resample through the homography. Returns null when the corners are
 * degenerate — the caller just keeps the original photo.
 */
export function deskewPoster(
  img: HTMLImageElement,
  corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
  maxDim = 1400,
): DeskewResult | null {
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  if (!sw || !sh) return null
  const px = corners.map((c) => ({ x: c.x * sw, y: c.y * sh }))
  const dist = (a: CornerPoint, b: CornerPoint) => Math.hypot(a.x - b.x, a.y - b.y)

  // Output size: average the opposing edge lengths so proportions stay honest.
  let w = Math.round((dist(px[0], px[1]) + dist(px[3], px[2])) / 2)
  let h = Math.round((dist(px[0], px[3]) + dist(px[1], px[2])) / 2)
  if (w < 32 || h < 32) return null
  const scale = Math.min(1, maxDim / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))

  // Inverse mapping: destination pixel → source pixel.
  const toSrc = solveHomography(
    [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
    px,
  )
  if (!toSrc) return null

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = sw
  srcCanvas.height = sh
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.drawImage(img, 0, 0)
  const src = srcCtx.getImageData(0, 0, sw, sh)
  const sd = src.data

  const outCanvas = document.createElement('canvas')
  outCanvas.width = w
  outCanvas.height = h
  const outCtx = outCanvas.getContext('2d')!
  const out = outCtx.createImageData(w, h)
  const od = out.data

  // Bilinear sample the source at each destination pixel centre.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = applyHomography(toSrc, { x: x + 0.5, y: y + 0.5 })
      const di = (y * w + x) * 4
      if (!p) { od[di + 3] = 255; continue }
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1)
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const tx = fx - x0
      const ty = fy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - tx) + sd[i10 + c] * tx
        const bot = sd[i01 + c] * (1 - tx) + sd[i11 + c] * tx
        od[di + c] = top * (1 - ty) + bot * ty
      }
      od[di + 3] = 255
    }
  }

  autoContrast(out)
  outCtx.putImageData(out, 0, 0)

  const toDeskewed = solveHomography(corners, UNIT_SQUARE)
  if (!toDeskewed) return null
  return { canvas: outCanvas, toDeskewed }
}

/** Light auto-contrast: stretch the 2nd..98th luminance percentile, gain capped
 *  at 1.6 so a dim photo brightens without blowing out the poster art. */
export function autoContrast(image: ImageData): void {
  const d = image.data
  const hist = new Uint32Array(256)
  const total = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++
  }
  const target = total * 0.02
  let lo = 0
  let hi = 255
  let acc = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { lo = i; break } }
  acc = 0
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= target) { hi = i; break } }
  if (hi - lo < 16) return // already flat or nearly binary — leave it alone
  const gain = Math.min(255 / (hi - lo), 1.6)
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = Math.min(255, Math.max(0, (d[i + c] - lo) * gain))
    }
  }
}
