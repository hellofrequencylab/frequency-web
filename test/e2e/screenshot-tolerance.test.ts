// The visual gate's tolerance must not scale with page height (LIVE-125, ADR-1258).
//
// Why this exists. The suite compared full-page captures against `maxDiffPixelRatio: 0.02`,
// a tolerance whose whole point is to absorb font and antialiasing noise. A ratio absorbs a
// SHARE of the canvas, and these canvases run from 390x844 to 1280x16110, so one setting
// forgave 6,583 pixels on the shortest baseline and 412,416 on the tallest. The taller the
// page, the more of it could change unseen, and tall pages are the content-rich ones. It cost
// a correct change being marked broken (ADR-1161) and hid 21 real drifts (ADR-1165).
//
// So the config now sets an ABSOLUTE `maxDiffPixels`, and this file is the guard that notices
// if that ever stops being true. It is deliberately a plain vitest test rather than a check
// inside the Playwright run: the arithmetic is a property of the CONFIG and the committed
// baselines, needs no browser and no baseURL, and therefore runs on every PR — while `@visual`
// is opt-in and needs a deploy URL. A config value with no test is the shape this repo keeps
// getting bitten by; a config value whose test only re-reads the literal is the same shape
// wearing a hat, so nothing below asserts the number itself. Each assertion measures a
// CONSEQUENCE: constant across every real baseline, flat as height grows, and small enough
// that the smallest control the design system draws cannot hide inside it.

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import config, { SCREENSHOT_MAX_DIFF_PIXELS } from '../../playwright.config'

const BASELINE_DIR = join('test', 'e2e', '__screenshots__', 'visual.spec.ts')
const GLOBALS_CSS = join('app', 'globals.css')

/** The two halves of Playwright's screenshot tolerance, as the config declares them. */
type Tolerance = { maxDiffPixels?: number; maxDiffPixelRatio?: number }

const tolerance: Tolerance = (config.expect?.toHaveScreenshot ?? {}) as Tolerance

/**
 * How many differing pixels a tolerance forgives on a capture of `area` pixels.
 *
 * This models what the CONFIG declares, which is the thing under test: an absolute budget is
 * flat, a ratio is a share of the canvas, and with neither set nothing is forgiven at all
 * (Playwright's default is an exact match). Where both are declared the stricter one binds,
 * which is why the first test insists exactly one is.
 */
function forgivenPixels(t: Tolerance, area: number): number {
  if (t.maxDiffPixels === undefined && t.maxDiffPixelRatio === undefined) return 0
  const absolute = t.maxDiffPixels ?? Number.POSITIVE_INFINITY
  const proportional =
    t.maxDiffPixelRatio === undefined ? Number.POSITIVE_INFINITY : area * t.maxDiffPixelRatio
  return Math.min(absolute, proportional)
}

/**
 * A PNG's real pixel dimensions, read from its IHDR chunk.
 *
 * 24 bytes per file, not `readFileSync`: this folder is 195 MB of screenshots, and a guard that
 * has to slurp all of it to answer an arithmetic question is a guard someone eventually skips.
 */
function pngSize(file: string): { width: number; height: number } {
  const head = Buffer.alloc(24)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, head, 0, 24, 0)
  } finally {
    closeSync(fd)
  }
  if (head.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${file} is not a PNG`)
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

type Baseline = { name: string; width: number; height: number; area: number }
let cached: Baseline[] | null = null

/** Every committed baseline with its true dimensions, largest canvas first. */
function committedBaselines(): Baseline[] {
  cached ??= readdirSync(BASELINE_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((name) => {
      const { width, height } = pngSize(join(BASELINE_DIR, name))
      return { name, width, height, area: width * height }
    })
    .sort((a, b) => b.area - a.area)
  return cached
}

/**
 * The smallest control the design system draws, in pixels of area, READ OFF THE SHEET.
 *
 * `--tap-min` is the minimum interactive target size and is deliberately non-monotonic across
 * generation presets: it is 32px by default and dips to 26px in one of them (app/globals.css).
 * The smallest declared value is therefore the smallest box a member can tap, and it is the
 * ceiling this tolerance must stay under. Derived rather than hardcoded so that a preset which
 * lowers the floor re-opens the question here instead of silently widening the blind spot.
 */
function smallestControlArea(): number {
  const sheet = readFileSync(GLOBALS_CSS, 'utf8')
  const sizes = [...sheet.matchAll(/--tap-min:\s*(\d+)px/g)].map((m) => Number(m[1]))
  if (sizes.length === 0) throw new Error('no --tap-min declarations found in app/globals.css')
  const smallest = Math.min(...sizes)
  return smallest * smallest
}

describe('visual gate tolerance', () => {
  it('is an absolute pixel budget, not a share of the canvas', () => {
    expect(existsSync(BASELINE_DIR)).toBe(true)
    // A ratio is the defect this row closed. Do not restore one "as a ceiling beside" the
    // budget: the two interact, and the reader then has to know which binds on which page.
    expect(tolerance.maxDiffPixelRatio).toBeUndefined()
    expect(tolerance.maxDiffPixels).toBe(SCREENSHOT_MAX_DIFF_PIXELS)
    expect(Number.isInteger(SCREENSHOT_MAX_DIFF_PIXELS)).toBe(true)
    // Not zero. A single subpixel moved by a Chromium bump would fail every surface at once,
    // and a gate that fails on nothing gets routed around (ADR-970).
    expect(SCREENSHOT_MAX_DIFF_PIXELS).toBeGreaterThan(0)
  })

  it('forgives the same number of pixels on every committed baseline', () => {
    const baselines = committedBaselines()
    expect(baselines.length).toBeGreaterThan(0)

    const forgiven = new Set(baselines.map((b) => forgivenPixels(tolerance, b.area)))
    const tallest = baselines[0]
    const shortest = baselines[baselines.length - 1]
    // One number for a 20-megapixel marketing page and for a 390x844 viewport capture alike.
    expect({ distinctBudgets: [...forgiven], tallest: tallest.area, shortest: shortest.area }).toEqual({
      distinctBudgets: [SCREENSHOT_MAX_DIFF_PIXELS],
      tallest: tallest.area,
      shortest: shortest.area,
    })
    expect(tallest.area / shortest.area).toBeGreaterThan(10) // the spread is real, not incidental
  })

  it('does not grow with page height', () => {
    // Every capture in the suite is one of THREE widths (320 joined on ADR-1270); height is
    // the axis that runs away.
    for (const width of [320, 390, 1280]) {
      const heights = [844, 2859, 9541, 16110, 21777, 100_000]
      const forgiven = heights.map((h) => forgivenPixels(tolerance, width * h))
      expect(new Set(forgiven).size).toBe(1)
      expect(forgiven[forgiven.length - 1]).toBe(forgiven[0])
    }
  })

  it('cannot hide the smallest control the design system draws', () => {
    const control = smallestControlArea()
    const tallest = committedBaselines()[0]
    expect(SCREENSHOT_MAX_DIFF_PIXELS).toBeLessThan(control)
    // The consequence, stated as the gate's verdict: a change the size of one control fails,
    // on the tallest page in the suite, which is where the old instrument was blindest.
    expect(control > forgivenPixels(tolerance, tallest.area)).toBe(true)
  })

  it('is a real change of instrument: the retired ratio DID grow with height', () => {
    // The positive control. Without it, the three tests above pass on any model that returns a
    // constant, including one that has stopped reading the config at all.
    const retired: Tolerance = { maxDiffPixelRatio: 0.02 }
    const baselines = committedBaselines()
    const tallest = baselines[0]
    const shortest = baselines[baselines.length - 1]

    const wide = forgivenPixels(retired, tallest.area)
    const narrow = forgivenPixels(retired, shortest.area)
    expect(wide).toBeGreaterThan(narrow * 10)
    // ...and it forgave whole controls, by the dozen, on the pages that carry the most.
    expect(wide / smallestControlArea()).toBeGreaterThan(100)
    // The live tolerance forgives the same count on both of those canvases.
    expect(forgivenPixels(tolerance, tallest.area)).toBe(forgivenPixels(tolerance, shortest.area))
  })
})
