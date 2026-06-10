// Pure projective-transform math for the poster deskew (no I/O, no DOM). The
// capture UI warps a tilted poster photo into a squared image entirely on the
// client; this module holds the matrix math so it stays unit-testable. A 3x3
// homography H maps source points to destination points in homogeneous
// coordinates: [x', y', w'] = H · [x, y, 1], point = (x'/w', y'/w').

import type { CornerPoint, ImageBox } from './types'

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/**
 * Solve the homography that maps the four `src` points onto the four `dst`
 * points (standard DLT: 8 unknowns with h22 fixed at 1, solved by Gaussian
 * elimination with partial pivoting). Returns null for degenerate input
 * (collinear points, repeated points, a singular system).
 */
export function solveHomography(
  src: readonly CornerPoint[],
  dst: readonly CornerPoint[],
): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null

  // Build the 8x9 augmented system A·h = b.
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    if (!isFinite(x) || !isFinite(y) || !isFinite(u) || !isFinite(v)) return null
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]]
    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const f = a[row][col] / a[col][col]
      if (f === 0) continue
      for (let k = col; k < 9; k++) a[row][k] -= f * a[col][k]
    }
  }

  const h: number[] = []
  for (let i = 0; i < 8; i++) {
    const v = a[i][8] / a[i][i]
    if (!isFinite(v)) return null
    h.push(v)
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

/** Apply a homography to one point. Returns null when the point maps to the
 *  line at infinity (w ~ 0). */
export function applyHomography(m: Mat3, p: CornerPoint): CornerPoint | null {
  const w = m[6] * p.x + m[7] * p.y + m[8]
  if (Math.abs(w) < 1e-12) return null
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  }
}

/**
 * Map an axis-aligned box through a homography and take the bounding box of the
 * four mapped corners, clamped to the unit square. Used to carry the model's
 * crop regions (given on the ORIGINAL photo) onto the deskewed image. Returns
 * null when the mapped region collapses to nothing.
 */
export function mapBoxThroughHomography(m: Mat3, box: ImageBox): ImageBox | null {
  const corners: CornerPoint[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of corners) {
    const p = applyHomography(m, c)
    if (!p) return null
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const x = Math.min(Math.max(minX, 0), 1)
  const y = Math.min(Math.max(minY, 0), 1)
  const w = Math.min(Math.max(maxX, 0), 1) - x
  const h = Math.min(Math.max(maxY, 0), 1) - y
  if (w <= 0.01 || h <= 0.01) return null
  return { x, y, w, h }
}
