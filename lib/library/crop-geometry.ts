// The Loom crop/rotate editor's geometry (HYG-109, ADR-1592). PURE: no DOM, no canvas, no IO, so the
// math a person's crop depends on is pinned in a unit test and the editor component stays thin.
//
// The model. The source image is W x H. It is turned by `deg` (quarter turns plus a fine straighten,
// clockwise, the direction canvas `rotate` draws). A crop is an axis-aligned rectangle in that TURNED
// frame, in source pixels, measured from the image centre: `{ cx, cy, w, h }`. A crop is valid only
// when all four corners sit on the image, so a straightened photo never gains empty corners.
//
// This is the whole editor's dependency: none. HYG-109 weighed Filerobot (seven packages, ~6.8 MB, a
// second styling runtime) against a native Canvas 2D crop over CROP_FRAMES; this is the native exit.

import { CROP_FRAMES } from './renditions'
import { isVectorFile } from '@/lib/loom/urls'

export type CropFrameKey = (typeof CROP_FRAMES)[number]['key']

/** A crop in the turned frame, source pixels, centre-relative. */
export type CropRect = { cx: number; cy: number; w: number; h: number }

/** The smallest crop edge an operator can drag to, in source pixels. */
export const MIN_CROP_EDGE = 16

/** The longest edge the editor encodes. Canvas has hard size limits on phones, and the upload seam
 *  shrinks anything big afterwards anyway (prepareImageForUpload). */
export const MAX_OUTPUT_EDGE = 4096

// Float slack only: a crop may not overhang the picture, or the encode gains a transparent sliver.
const EPS = 1e-6

/** Only a raster still that a canvas can redraw is offered the editor. A vector is already sharp and
 *  editable by Vera; a GIF would be flattened to its first frame. */
export function isCroppableImage(kind: string, mime: string | null | undefined, url: string | null | undefined): boolean {
  if (kind !== 'image' || !url) return false
  if (isVectorFile(mime, url)) return false
  if (mime && /gif/i.test(mime)) return false
  return true
}

function trig(deg: number): { c: number; s: number } {
  const r = (deg * Math.PI) / 180
  // Snap the quarter turns so 90° does not leave a 6e-17 sliver that fails an exact inside test.
  const c = Math.abs(Math.cos(r)) < 1e-12 ? 0 : Math.cos(r)
  const s = Math.abs(Math.sin(r)) < 1e-12 ? 0 : Math.sin(r)
  return { c, s }
}

/** The bounding box of the image once turned by `deg`. */
export function rotatedBounds(W: number, H: number, deg: number): { w: number; h: number } {
  const { c, s } = trig(deg)
  return { w: W * Math.abs(c) + H * Math.abs(s), h: W * Math.abs(s) + H * Math.abs(c) }
}

/** Whether every corner of `rect` lands on the turned image. */
export function isInside(rect: CropRect, W: number, H: number, deg: number): boolean {
  if (!(rect.w > 0 && rect.h > 0)) return false
  const { c, s } = trig(deg)
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      const x = rect.cx + (dx * rect.w) / 2
      const y = rect.cy + (dy * rect.h) / 2
      // Undo the turn to land back in the source frame.
      const px = x * c + y * s
      const py = -x * s + y * c
      if (Math.abs(px) > W / 2 + EPS || Math.abs(py) > H / 2 + EPS) return false
    }
  }
  return true
}

/** The aspect a frame asks for. Freeform keeps the picture's own aspect as it now stands. */
export function frameRatio(key: CropFrameKey, W: number, H: number, deg: number): number {
  const frame = CROP_FRAMES.find((f) => f.key === key)
  if (frame && frame.ratio !== null) return frame.ratio
  const quarter = Math.round(deg / 90)
  return Math.abs(quarter) % 2 === 1 ? H / W : W / H
}

/** The largest crop of aspect `ratio` (w / h), centred, that fits on the turned image. For a centred
 *  rectangle with half-height b and half-width r*b, the worst corner gives two linear bounds:
 *  b(r|cos|+|sin|) <= W/2 and b(r|sin|+|cos|) <= H/2. */
export function largestCentered(W: number, H: number, deg: number, ratio: number): CropRect {
  const { c, s } = trig(deg)
  const ac = Math.abs(c)
  const as = Math.abs(s)
  const b = Math.min(W / 2 / (ratio * ac + as), H / 2 / (ratio * as + ac)) * 0.9999
  return { cx: 0, cy: 0, w: 2 * ratio * b, h: 2 * b }
}

/** Largest t in [0, 1] for which `at(t)` is valid, given `at(0)` is. Bisection: the constraint set is
 *  convex, so validity along a straight path is one interval starting at 0. */
function furthestValid(at: (t: number) => CropRect, W: number, H: number, deg: number): CropRect {
  if (isInside(at(1), W, H, deg)) return at(1)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (isInside(at(mid), W, H, deg)) lo = mid
    else hi = mid
  }
  return at(lo)
}

/** Move the crop by (dx, dy) source pixels, stopping at the image edge instead of refusing the drag. */
export function moveCrop(rect: CropRect, dx: number, dy: number, W: number, H: number, deg: number): CropRect {
  const along = (t: number): CropRect => ({ ...rect, cx: rect.cx + dx * t, cy: rect.cy + dy * t })
  const moved = furthestValid(along, W, H, deg)
  // Slide along the edge: if the diagonal stopped short, try the leftover on each axis alone.
  if (moved.cx === rect.cx + dx && moved.cy === rect.cy + dy) return moved
  const xOnly = furthestValid((t) => ({ ...moved, cx: moved.cx + (rect.cx + dx - moved.cx) * t }), W, H, deg)
  return furthestValid((t) => ({ ...xOnly, cy: xOnly.cy + (rect.cy + dy - xOnly.cy) * t }), W, H, deg)
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** Resize by dragging `corner` to (px, py) in the turned frame; the opposite corner stays put. With a
 *  `ratio` the frame's aspect is kept; null is freeform. Clamped to the image and to MIN_CROP_EDGE. */
export function resizeCrop(
  rect: CropRect,
  corner: Corner,
  px: number,
  py: number,
  ratio: number | null,
  W: number,
  H: number,
  deg: number,
): CropRect {
  const sx = corner === 'ne' || corner === 'se' ? 1 : -1
  const sy = corner === 'sw' || corner === 'se' ? 1 : -1
  const ax = rect.cx - (sx * rect.w) / 2
  const ay = rect.cy - (sy * rect.h) / 2
  let w = Math.max(MIN_CROP_EDGE, (px - ax) * sx)
  let h = Math.max(MIN_CROP_EDGE, (py - ay) * sy)
  if (ratio) {
    // Follow whichever axis the pointer pulled further, then derive the other.
    if (w / ratio >= h) h = w / ratio
    else w = h * ratio
    if (h < MIN_CROP_EDGE) {
      h = MIN_CROP_EDGE
      w = h * ratio
    }
    if (w < MIN_CROP_EDGE) {
      w = MIN_CROP_EDGE
      h = w / ratio
    }
  }
  const sized = (tw: number, th: number): CropRect => ({ cx: ax + (sx * tw) / 2, cy: ay + (sy * th) / 2, w: tw, h: th })
  const target = sized(w, h)
  if (isInside(target, W, H, deg)) return target
  // Grow from the current size toward the target and stop at the edge.
  return furthestValid((t) => sized(rect.w + (w - rect.w) * t, rect.h + (h - rect.h) * t), W, H, deg)
}

/** The encoded size for a crop, capped at MAX_OUTPUT_EDGE, and the scale that cap applies. */
export function outputSize(rect: CropRect): { width: number; height: number; scale: number } {
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(rect.w, rect.h))
  return {
    width: Math.max(1, Math.round(rect.w * scale)),
    height: Math.max(1, Math.round(rect.h * scale)),
    scale,
  }
}

/** The version note that labels the pre-edit snapshot, so the history says what the edit was. */
export function editNote(frame: CropFrameKey, quarterTurns: number, straighten: number): string {
  const parts: string[] = []
  const label = CROP_FRAMES.find((f) => f.key === frame)?.label ?? 'Freeform'
  parts.push(`Cropped (${label})`)
  const turns = ((quarterTurns % 4) + 4) % 4
  if (turns) parts.push(`rotated ${turns * 90}°`)
  if (straighten) parts.push(`straightened ${straighten > 0 ? '+' : ''}${straighten}°`)
  return parts.join(', ')
}
