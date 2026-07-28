// Content-aware hero text (ADR-830) — the shared math behind a header that decides its own
// text tone from the pixels behind it. A PageHero cover can be anything a member uploads
// (bright sky, dark timber, mid-tone crowd), and the overlay setting (none / shadow / fade,
// with a custom color) changes the EFFECTIVE darkness under the lockup. The old approach —
// always-light copy plus a text-shadow glow — produced the dark-on-dark-with-glow reads the
// owner rejected. Instead:
//
//   1. sample the cover region BEHIND the text block (bottom-left for the identity lockup),
//      exactly as the CSS cover crop shows it (object-fit: cover + the focal point);
//   2. composite the active overlay over that sample (shadow/fade pull the region toward the
//      overlay color at the text band's approximate alpha);
//   3. pick the text tone with the better WCAG contrast against the result, and ask for a
//      subtle scrim only when even the better tone lands under the readability floor.
//
// The pure pieces (parse / luminance / contrast / resolveMediaTone) are dependency-free and
// unit-tested; sampleCoverRegionLuminance is the one browser-only function (canvas). Wired to
// the PROFILE header today via components/templates/hero-adaptive-text.tsx; Space/event heroes
// can adopt the same seam (PageHero's `adaptiveText` prop) without new math.

import { objectPositionToXY } from './focal-point'

/** A region of the hero container, in 0..1 fractions of its width/height. */
export interface RegionFraction {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Where the identity lockup sits: the bottom-left band of the hero.
 *
 *  NARROWED (2026-07-28) from x1 0.62 / y0 0.5 to the box the name + @handle actually occupy. The
 *  old band swept most of the cover's lower half, so a subject standing anywhere right of centre
 *  (or high in the band) dominated the statistic for text that never sits on it. With the secondary
 *  controls moved off the cover, the only overlaid copy is this lockup, so the sample can match it. */
export const HERO_TEXT_REGION: RegionFraction = { x0: 0, y0: 0.68, x1: 0.5, y1: 1 }

/** The readability floor (WCAG AA for large text is 3:1; we aim a step higher because the
 *  backdrop is a photo average, not a flat color). Below this, the scrim turns on. */
export const MIN_HERO_CONTRAST = 4.5

export type HeroOverlayMode = 'none' | 'shadow' | 'fade'

/** sRGB channel (0-255) → linear-light value, per WCAG relative luminance. */
function channelToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance (0..1) from 8-bit RGB. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

/** WCAG contrast ratio (1..21) between two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

/** Parse a CSS color as authored in the token layer — #rgb / #rrggbb / #rrggbbaa or
 *  rgb()/rgba() — into 8-bit RGB. Returns null for anything else (a caller falls back). */
export function parseCssColor(value: string | null | undefined): [number, number, number] | null {
  const v = (value ?? '').trim()
  if (!v) return null
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(v)
  if (hex) {
    const h = hex[1]
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(v)
  if (rgb) {
    const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)))
    return [clamp(Number(rgb[1])), clamp(Number(rgb[2])), clamp(Number(rgb[3]))]
  }
  return null
}

/** The overlay's approximate coverage over the TEXT BAND (the bottom of the hero), matching
 *  the gradient stops in PageHero's shadowScrim/fadeScrim: shadow runs 55% → 92% across the
 *  lower half (the lockup sits in its darkest reach), fade ramps 0 → 88% from 38% down.
 *  'none' leaves the photo raw. */
export function overlayAlphaInTextBand(style: HeroOverlayMode): number {
  if (style === 'shadow') return 0.85
  if (style === 'fade') return 0.6
  return 0
}

export interface MediaToneInput {
  /** Average relative luminance of the sampled cover region (0..1). */
  mediaLuminance: number
  /** The active overlay mode over the cover. */
  overlayStyle: HeroOverlayMode
  /** Relative luminance of the overlay color (ink/canvas token default or the custom pick). */
  overlayLuminance: number
  /** Relative luminance of the light text option (the on-media-light token). */
  lightTextLuminance: number
  /** Relative luminance of the dark text option (the on-media-dark token). */
  darkTextLuminance: number
}

export interface MediaToneResult {
  /** The EFFECTIVE tone of the backdrop behind the text: 'dark' → render light copy,
   *  'light' → render dark copy. */
  tone: 'dark' | 'light'
  /** True when even the better text tone falls under the floor — add the subtle scrim. */
  scrim: boolean
  /** The winning contrast ratio (diagnostics/tests). */
  contrast: number
}

/** The decision: composite the overlay over the sampled media, then pick the text tone with
 *  the better contrast; ask for a scrim when the winner still misses the floor
 *  (MIN_HERO_CONTRAST). Pure. */
export function resolveMediaTone({
  mediaLuminance,
  overlayStyle,
  overlayLuminance,
  lightTextLuminance,
  darkTextLuminance,
}: MediaToneInput): MediaToneResult {
  const alpha = overlayAlphaInTextBand(overlayStyle)
  const effective = overlayLuminance * alpha + mediaLuminance * (1 - alpha)
  const lightContrast = contrastRatio(effective, lightTextLuminance)
  const darkContrast = contrastRatio(effective, darkTextLuminance)
  const useLightText = lightContrast >= darkContrast
  const contrast = useLightText ? lightContrast : darkContrast
  return {
    tone: useLightText ? 'dark' : 'light',
    scrim: contrast < MIN_HERO_CONTRAST,
    contrast,
  }
}

/** Average the relative luminance of the part of `src` that the hero's cover crop shows in
 *  `region` — i.e. the pixels actually behind the text. Reproduces object-fit: cover with the
 *  focal point (object-position), so a repositioned photo samples the right band. BROWSER
 *  ONLY (canvas); resolves null on any failure (no CORS grant, decode error, zero size), and
 *  the caller falls back to overlay-only heuristics plus the scrim. */
export async function sampleCoverRegionLuminance(
  src: string,
  opts: {
    containerWidth: number
    containerHeight: number
    /** The cover's focal point ("x% y%"); centered when absent. */
    focus?: string | null
  },
): Promise<number | null> {
  if (typeof document === 'undefined') return null
  try {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = src
    await img.decode()
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) return null

    const cw = Math.max(1, opts.containerWidth)
    const ch = Math.max(1, opts.containerHeight)
    // object-fit: cover — scale to fill, then object-position aligns the focal percent of the
    // image with the same percent of the box.
    const scale = Math.max(cw / iw, ch / ih)
    const { x: fx, y: fy } = objectPositionToXY(opts.focus ?? null)
    const offsetX = (cw - iw * scale) * (fx / 100)
    const offsetY = (ch - ih * scale) * (fy / 100)

    const region = HERO_TEXT_REGION
    // Container-space region → image-space source rect, clamped to the image bounds.
    const sx0 = Math.max(0, Math.min(iw, (cw * region.x0 - offsetX) / scale))
    const sx1 = Math.max(0, Math.min(iw, (cw * region.x1 - offsetX) / scale))
    const sy0 = Math.max(0, Math.min(ih, (ch * region.y0 - offsetY) / scale))
    const sy1 = Math.max(0, Math.min(ih, (ch * region.y1 - offsetY) / scale))
    const sw = sx1 - sx0
    const sh = sy1 - sy0
    if (sw < 1 || sh < 1) return null

    const SIZE = 24
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, sx0, sy0, sw, sh, 0, 0, SIZE, SIZE)
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data
    // The WORST-CASE bright pixel (p85), not the mean. A photo with a bright subject beside dark
    // ground averages to a mid-tone that scores as passing while the copy is invisible over the
    // bright part — the exact production read: a white fur coat beside dark timber averaged light,
    // so the sensor flipped the name to BLACK over the dark wood it actually sits on. A high
    // percentile answers the question that matters for light copy ("how bright does this text have
    // to survive?") and is robust to the few blown-out pixels a true max would trip on.
    const lums: number[] = []
    for (let i = 0; i < data.length; i += 4) {
      lums.push(relativeLuminance(data[i], data[i + 1], data[i + 2]))
    }
    if (!lums.length) return null
    lums.sort((a, b) => a - b)
    return lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.85))]
  } catch {
    // Tainted canvas (no CORS grant), decode failure, unsupported source — degrade gracefully.
    return null
  }
}
