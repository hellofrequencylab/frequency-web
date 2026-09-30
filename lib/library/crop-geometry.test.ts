import { describe, it, expect } from 'vitest'
import { CROP_FRAMES } from './renditions'
import {
  isCroppableImage,
  rotatedBounds,
  isInside,
  frameRatio,
  largestCentered,
  moveCrop,
  resizeCrop,
  outputSize,
  editNote,
  MAX_OUTPUT_EDGE,
  MIN_CROP_EDGE,
} from './crop-geometry'

const W = 1200
const H = 800

describe('the Loom crop editor geometry (HYG-109)', () => {
  it('offers the editor to raster stills only', () => {
    expect(isCroppableImage('image', 'image/jpeg', 'https://x/a.jpg')).toBe(true)
    expect(isCroppableImage('image', 'image/png', 'https://x/a.png')).toBe(true)
    expect(isCroppableImage('image', 'image/svg+xml', 'https://x/a.svg')).toBe(false)
    expect(isCroppableImage('image', null, 'https://x/a.svg?v=1')).toBe(false)
    expect(isCroppableImage('image', 'image/gif', 'https://x/a.gif')).toBe(false)
    expect(isCroppableImage('image', 'image/jpeg', null)).toBe(false)
    expect(isCroppableImage('video', 'video/mp4', 'https://x/a.mp4')).toBe(false)
    expect(isCroppableImage('element', null, null)).toBe(false)
  })

  it('a quarter turn swaps the bounds exactly, and a straighten grows them', () => {
    expect(rotatedBounds(W, H, 0)).toEqual({ w: W, h: H })
    expect(rotatedBounds(W, H, 90)).toEqual({ w: H, h: W })
    expect(rotatedBounds(W, H, -270)).toEqual({ w: H, h: W })
    const b = rotatedBounds(W, H, 10)
    expect(b.w).toBeGreaterThan(W)
    expect(b.h).toBeGreaterThan(H)
  })

  it('every CROP_FRAME has a centred crop that fits, at every quarter turn and a straighten', () => {
    for (const frame of CROP_FRAMES) {
      for (const deg of [0, 90, 180, 270, 7.5, -12, 97]) {
        const ratio = frameRatio(frame.key, W, H, deg)
        const r = largestCentered(W, H, deg, ratio)
        expect(isInside(r, W, H, deg), `${frame.key} at ${deg}°`).toBe(true)
        expect(r.w / r.h).toBeCloseTo(ratio, 6)
        // Largest: 1% bigger no longer fits.
        expect(isInside({ ...r, w: r.w * 1.01, h: r.h * 1.01 }, W, H, deg)).toBe(false)
      }
    }
  })

  it('freeform keeps the picture aspect, and a quarter turn flips it', () => {
    expect(frameRatio('free', W, H, 0)).toBeCloseTo(1.5)
    expect(frameRatio('free', W, H, 90)).toBeCloseTo(H / W)
    const full = largestCentered(W, H, 0, frameRatio('free', W, H, 0))
    expect(full.w).toBeCloseTo(W, 0)
    expect(full.h).toBeCloseTo(H, 0)
  })

  it('a straightened photo never keeps an empty corner', () => {
    const full = { cx: 0, cy: 0, w: W, h: H }
    expect(isInside(full, W, H, 0)).toBe(true)
    expect(isInside(full, W, H, 5)).toBe(false)
  })

  it('a drag stops at the image edge and slides along it', () => {
    const r = largestCentered(W, H, 0, 1) // 800 x 800 square, centred
    const right = moveCrop(r, 10_000, 0, W, H, 0)
    expect(right.cx).toBeCloseTo((W - r.w) / 2, 1)
    expect(right.cy).toBe(0)
    // A diagonal push into the top-right corner still reaches the right edge.
    const small = { cx: 0, cy: 0, w: 200, h: 200 }
    const diag = moveCrop(small, 10_000, -50, W, H, 0)
    expect(diag.cx).toBeCloseTo((W - 200) / 2, 1)
    expect(diag.cy).toBeCloseTo(-50, 1)
    expect(isInside(diag, W, H, 0)).toBe(true)
  })

  it('a corner drag keeps the frame aspect, holds the opposite corner and clamps to the image', () => {
    const r = { cx: 0, cy: 0, w: 400, h: 400 }
    const grown = resizeCrop(r, 'se', 300, 250, 1, W, H, 0)
    expect(grown.w).toBeCloseTo(grown.h, 6)
    expect(grown.cx - grown.w / 2).toBeCloseTo(-200, 6)
    expect(grown.cy - grown.h / 2).toBeCloseTo(-200, 6)
    const huge = resizeCrop(r, 'se', 10_000, 10_000, 1, W, H, 0)
    expect(isInside(huge, W, H, 0)).toBe(true)
    expect(huge.h).toBeCloseTo(H / 2 + 200, 0)
    const tiny = resizeCrop(r, 'se', -10_000, -10_000, null, W, H, 0)
    expect(tiny.w).toBe(MIN_CROP_EDGE)
    expect(tiny.h).toBe(MIN_CROP_EDGE)
    const free = resizeCrop(r, 'nw', -300, -100, null, W, H, 0)
    expect(free.w).toBeCloseTo(500, 6)
    expect(free.h).toBeCloseTo(300, 6)
  })

  it('the encode is capped on the long edge', () => {
    expect(outputSize({ cx: 0, cy: 0, w: 600, h: 400 })).toEqual({ width: 600, height: 400, scale: 1 })
    const big = outputSize({ cx: 0, cy: 0, w: 8192, h: 4096 })
    expect(big.width).toBe(MAX_OUTPUT_EDGE)
    expect(big.height).toBe(MAX_OUTPUT_EDGE / 2)
  })

  it('the version note says what the edit was', () => {
    expect(editNote('square', 0, 0)).toBe('Cropped (Square (1:1))')
    expect(editNote('free', -1, 2.5)).toBe('Cropped (Freeform), rotated 270°, straightened +2.5°')
  })
})
