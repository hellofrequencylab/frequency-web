// Client-side perspective deskew for captured card sides. The model returns the
// four corners of the card per image (normalized 0..1); we warp that quad into a
// flat rectangle on a <canvas> and apply a light auto-contrast, so the card kept
// on file looks like a scan, not a tilted phone photo.
//
// The math (homography solve + projection + target sizing) is pure and unit
// tested; only deskewCardCanvas touches the DOM. No I/O here.

import type { CardCorners, CornerPoint } from './types'

/** A 3x3 homography stored row-major as [a,b,c, d,e,f, g,h,1]. */
export type Homography = number[]

/**
 * Solve the homography that maps the destination rectangle (0,0)-(w,h) onto the
 * source quad (pixel coordinates, in order top-left, top-right, bottom-right,
 * bottom-left). Returns null when the system is degenerate (collinear corners).
 */
export function solveProjection(w: number, h: number, quad: CornerPoint[]): Homography | null {
  if (quad.length !== 4 || w <= 0 || h <= 0) return null
  const dst: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  // 8 unknowns [a,b,c,d,e,f,g,hh]; per point: two rows of the augmented matrix.
  const m: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i]
    const { x, y } = quad[i]
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x])
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y])
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]]
    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const f = m[row][col] / m[col][col]
      if (f === 0) continue
      for (let k = col; k <= 8; k++) m[row][k] -= f * m[col][k]
    }
  }
  const s = (i: number) => m[i][8] / m[i][i]
  return [s(0), s(1), s(2), s(3), s(4), s(5), s(6), s(7), 1]
}

/** Project a destination point (u,v) through the homography to source pixels. */
export function projectPoint(hm: Homography, u: number, v: number): { x: number; y: number } {
  const d = hm[6] * u + hm[7] * v + 1
  return {
    x: (hm[0] * u + hm[1] * v + hm[2]) / d,
    y: (hm[3] * u + hm[4] * v + hm[5]) / d,
  }
}

/**
 * Pick the flattened card's output size from the quad's edge lengths (pixel
 * coords): width from the average of the top/bottom edges, height from the
 * left/right edges, scaled so the long edge is at most maxEdge.
 */
export function cardTargetSize(
  quad: CornerPoint[],
  maxEdge = 1024,
): { w: number; h: number } {
  const len = (a: CornerPoint, b: CornerPoint) => Math.hypot(b.x - a.x, b.y - a.y)
  const [tl, tr, br, bl] = quad
  const w0 = (len(tl, tr) + len(bl, br)) / 2
  const h0 = (len(tl, bl) + len(tr, br)) / 2
  const scale = Math.min(1, maxEdge / Math.max(w0, h0, 1))
  return { w: Math.max(1, Math.round(w0 * scale)), h: Math.max(1, Math.round(h0 * scale)) }
}

/** Light linear contrast stretch between the 2nd and 98th luminance percentile. */
export function autoContrast(data: Uint8ClampedArray): void {
  const hist = new Array<number>(256).fill(0)
  const px = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++
  }
  let lo = 0
  let hi = 255
  let acc = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= px * 0.02) { lo = i; break } }
  acc = 0
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= px * 0.02) { hi = i; break } }
  if (hi - lo < 16 || (lo <= 4 && hi >= 251)) return // already full range or flat
  const scale = 255 / (hi - lo)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - lo) * scale))
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - lo) * scale))
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - lo) * scale))
  }
}

/**
 * Warp one card side flat. `img` is the decoded capture, `corners` the model's
 * normalized quad for that image. Returns a canvas holding the deskewed,
 * lightly contrast-stretched card, or null when the warp is not possible
 * (degenerate quad). Browser only.
 */
export function deskewCardCanvas(
  img: HTMLImageElement,
  corners: CardCorners,
  maxEdge = 1024,
): HTMLCanvasElement | null {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return null
  const quad = corners.map((p) => ({ x: p.x * iw, y: p.y * ih }))
  const { w, h } = cardTargetSize(quad, maxEdge)
  const hm = solveProjection(w, h, quad)
  if (!hm) return null

  // Read the source pixels once.
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = iw
  srcCanvas.height = ih
  const srcCtx = srcCanvas.getContext('2d')
  if (!srcCtx) return null
  srcCtx.drawImage(img, 0, 0)
  const src = srcCtx.getImageData(0, 0, iw, ih).data

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const outCtx = out.getContext('2d')
  if (!outCtx) return null
  const dest = outCtx.createImageData(w, h)
  const d = dest.data

  // Inverse-map each destination pixel and bilinear-sample the source.
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const p = projectPoint(hm, u + 0.5, v + 0.5)
      const di = (v * w + u) * 4
      const x = p.x - 0.5
      const y = p.y - 0.5
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      if (x0 < 0 || y0 < 0 || x0 >= iw - 1 || y0 >= ih - 1) {
        d[di] = d[di + 1] = d[di + 2] = 255
        d[di + 3] = 255
        continue
      }
      const fx = x - x0
      const fy = y - y0
      const i00 = (y0 * iw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + iw * 4
      const i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        d[di + c] =
          src[i00 + c] * (1 - fx) * (1 - fy) +
          src[i10 + c] * fx * (1 - fy) +
          src[i01 + c] * (1 - fx) * fy +
          src[i11 + c] * fx * fy
      }
      d[di + 3] = 255
    }
  }

  autoContrast(d)
  outCtx.putImageData(dest, 0, 0)
  return out
}
