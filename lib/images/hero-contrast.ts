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
//
// PER-ZONE (ADR-894, extends ADR-830) — the second half of the same idea. ONE tone for the whole
// hero is a lie on a split cover: the owner's photo is a bright subject beside dark timber, and
// the name sits on the timber. A single statistic over one band answers "how bright is this
// header", which is not a question any reader asks. The zone functions below answer the one that
// matters — "how bright is it behind THESE WORDS" — per text run:
//
//   zoneRegion()          — a zone's measured box, in the hero's own 0..1 coordinate space
//   tileLuminancesFrom()  — that box as an 8x4 grid of tile luminances (one decode, many zones)
//   resolveZoneTone()     — the tone AND the plate rung, from the WORST tile, not an average
//
// The tile grid supersedes the p85 percentile INSIDE a zone: p85 is the right robust answer for
// one big band, but a zone is the size of the actual words, so a tile is a few glyphs wide and
// "every tile must clear the floor" is both stricter and easier to reason about. p85 survives as
// the section-level fallback (sampleCoverRegionLuminance) for a hero that renders no zones.

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

/** Linear-light (0..1) → the gamma-encoded sRGB value the compositor actually blends. */
export function srgbEncode(linear: number): number {
  const l = Math.min(1, Math.max(0, linear))
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
}

/** Gamma-encoded sRGB (0..1) → linear light. Inverse of srgbEncode. */
export function srgbDecode(encoded: number): number {
  const s = Math.min(1, Math.max(0, encoded))
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Composite a translucent layer over a backdrop THE WAY A BROWSER DOES IT, and return the
 *  result's relative luminance.
 *
 *  🔴 This is the correction that changes the whole plate ladder, so it is spelled out. CSS alpha
 *  compositing happens in GAMMA-ENCODED sRGB, not in linear light. Blending the two luminances
 *  directly (`a*α + b*(1-α)`) overstates a dark layer's effect by roughly 4x: 45% cream over a
 *  black tile models as L 0.39 (≈ 8:1 for dark copy) but RENDERS at L 0.148 (≈ 3.5:1), which is
 *  the difference between "legible" and the read the owner photographed.
 *
 *  Authoring the CSS in `color-mix(in srgb-linear, …)` does NOT fix this, and it is worth saying
 *  because it looks like it should: mixing a colour with `transparent` yields that colour carrying
 *  an ALPHA, whatever space the mix names, and the alpha composite over the photo still runs in the
 *  destination space. So the model moves to sRGB; the CSS stays in `srgb`; the two agree.
 *
 *  Both inputs are luminances, i.e. this treats each layer as its neutral-grey equivalent. Exact
 *  for the near-neutral ink/on-ink plate tokens, an approximation for a saturated photo tile, and
 *  the error is far smaller than the colour-space error it replaces. */
export function compositeOverSrgb(backdropLuminance: number, layerLuminance: number, alpha: number): number {
  if (alpha <= 0) return backdropLuminance
  if (alpha >= 1) return layerLuminance
  const blended = srgbEncode(backdropLuminance) * (1 - alpha) + srgbEncode(layerLuminance) * alpha
  return srgbDecode(blended)
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
  // sRGB composite, not a linear blend — the scrim is a translucent CSS layer like any other
  // (see compositeOverSrgb). The two models disagree most on a dark scrim over a bright photo,
  // which is the single commonest hero on the site.
  const effective = compositeOverSrgb(mediaLuminance, overlayLuminance, alpha)
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

// ── Per-zone resolution (ADR-894) ────────────────────────────────────────────────────────────

/** The legibility ladder. 0 nothing · 1 the per-glyph halo · 2 halo + plate · 3 halo + strong
 *  plate. Rung 1 is deliberately NOT a rectangle: the shipped `on-image-text` shadow is a
 *  per-glyph treatment that keeps a clean photo clean, and it is the pre-ADR-830 baseline we
 *  already know reads on real covers. A bar only appears when the pixels genuinely demand one. */
export type HeroPlateRung = 0 | 1 | 2 | 3

/** The plate's alpha per rung. THIS IS ONE CONTRACT WITH app/globals.css — the
 *  `.hero-adaptive-text .hero-zone[data-media-plate="N"]` rules set `--hero-plate-alpha` to
 *  exactly these numbers as percentages. Change one, change both, or the resolver promises a
 *  contrast the paint does not deliver. A drift guard asserts they agree. */
export const HERO_PLATE_ALPHAS: Record<HeroPlateRung, number> = { 0: 0, 1: 0, 2: 0.45, 3: 0.7 }

/** WCAG AA for large text. Between this and MIN_HERO_CONTRAST the halo alone is enough; below
 *  it, the zone needs a plate. */
export const HERO_HALO_CONTRAST = 3

/** The zone sampling grid. 8 x 4 over a lockup-sized box makes each tile roughly a few glyphs
 *  wide: one specular pixel cannot force a plate, but a whole tile of white coat can. */
export const ZONE_TILE_COLS = 8
export const ZONE_TILE_ROWS = 4

export interface ZoneToneInput {
  /** Relative luminance per tile of the cover under THIS zone (0..1, linear light). */
  tiles: number[]
  overlayStyle: HeroOverlayMode
  overlayLuminance: number
  lightTextLuminance: number
  darkTextLuminance: number
}

export interface ZoneToneResult {
  /** 'dark' → the backdrop is dark, render LIGHT copy. 'light' → render dark copy. */
  tone: 'dark' | 'light'
  /** The legibility rung this zone needs (see HeroPlateRung). */
  plate: HeroPlateRung
  /** Worst-tile contrast for the chosen tone BEFORE any plate (diagnostics/tests). */
  contrast: number
}

/** How one tone fares across a zone: how many tiles it CLEARS the floor on, and its worst tile.
 *  Optionally under a plate of `plateLuminance` at `alpha`. */
function scoreTone(
  tiles: number[],
  textLuminance: number,
  plateLuminance: number,
  alpha: number,
): { passing: number; worst: number } {
  let passing = 0
  let worst = Infinity
  for (const tile of tiles) {
    const backdrop = compositeOverSrgb(tile, plateLuminance, alpha)
    const ratio = contrastRatio(backdrop, textLuminance)
    if (ratio >= MIN_HERO_CONTRAST) passing += 1
    if (ratio < worst) worst = ratio
  }
  return { passing, worst }
}

/** Resolve ONE text zone: which tone reads here, and what local treatment it needs.
 *
 *  THE TONE is chosen on HOW MANY TILES each option clears the floor on, with the worst tile as
 *  the tie-break. 🔴 Worst-tile alone is the obvious rule and it is WRONG on exactly the photo
 *  this work exists for. The owner's cover is a bright subject beside dark timber with the name on
 *  the timber; let one bright tile clip the edge of the lockup and worst-tile scores light copy at
 *  1.13:1 against dark copy's 1.24:1 on the wood, hands the tie to BLACK, and prints the name in
 *  black on black timber. Counting tiles asks the question a reader asks: which colour works for
 *  most of these words? The minority tiles are then rescued by the plate, which is the mechanism
 *  that exists for precisely that. Worst-tile still decides the ladder, where it is the right rule.
 *
 *  THE LADDER climbs only as far as the pixels force it: clear the floor everywhere and paint
 *  nothing; clear large-text AA and the halo carries it; below that, model the plate composite (in
 *  sRGB, see compositeOverSrgb) and take the FIRST rung that clears the floor.
 *
 *  The plate is always the OPPOSITE tone to the copy — ink behind light copy, on-ink behind dark
 *  copy — so it is derived from the resolved tone, never guessed separately.
 *
 *  Returns null when there is nothing to measure. That is not an error: it means "unmeasured", and
 *  the caller must leave the zone's data attributes off so the CSS renders the tone-free,
 *  plate-free baseline rather than a guess. Pure. */
export function resolveZoneTone({
  tiles,
  overlayStyle,
  overlayLuminance,
  lightTextLuminance,
  darkTextLuminance,
}: ZoneToneInput): ZoneToneResult | null {
  if (!tiles.length) return null
  const overlayAlpha = overlayAlphaInTextBand(overlayStyle)
  const effective = tiles.map((tile) => compositeOverSrgb(tile, overlayLuminance, overlayAlpha))

  const light = scoreTone(effective, lightTextLuminance, 0, 0)
  const dark = scoreTone(effective, darkTextLuminance, 0, 0)
  const useLightText = light.passing !== dark.passing ? light.passing > dark.passing : light.worst >= dark.worst
  const contrast = useLightText ? light.worst : dark.worst
  // Light copy sits on an ink plate; dark copy sits on an on-ink (cream) plate.
  const plateLuminance = useLightText ? darkTextLuminance : lightTextLuminance
  const textLuminance = useLightText ? lightTextLuminance : darkTextLuminance

  let plate: HeroPlateRung = 0
  if (contrast < HERO_HALO_CONTRAST) {
    plate = 3
    if (scoreTone(effective, textLuminance, plateLuminance, HERO_PLATE_ALPHAS[2]).worst >= MIN_HERO_CONTRAST) {
      plate = 2
    }
  } else if (contrast < MIN_HERO_CONTRAST) {
    plate = 1
  }

  return { tone: useLightText ? 'dark' : 'light', plate, contrast }
}

/** The subset of DOMRect the geometry needs, so zoneRegion stays pure and testable in node. */
export interface BoxRect {
  left: number
  top: number
  width: number
  height: number
}

/** A zone's box expressed in the hero's own 0..1 coordinate space — the space
 *  tileLuminancesFrom works in. MEASURED from the DOM rather than hardcoded as fractions,
 *  because that is the entire point of a zone: the sampled region is wherever the words landed
 *  at this viewport, with this name length, with this many chips. Clamped, so a zone that
 *  overhangs its hero (a wrapped chip cluster mid-transition) still yields a valid region. */
export function zoneRegion(zone: BoxRect, host: BoxRect): RegionFraction | null {
  if (host.width <= 0 || host.height <= 0) return null
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  const region = {
    x0: clamp((zone.left - host.left) / host.width),
    y0: clamp((zone.top - host.top) / host.height),
    x1: clamp((zone.left + zone.width - host.left) / host.width),
    y1: clamp((zone.top + zone.height - host.top) / host.height),
  }
  if (region.x1 <= region.x0 || region.y1 <= region.y0) return null
  return region
}

/** A decoded cover, kept so a hero with two zones (and a resize observer behind it) pays ONE
 *  decode instead of one per zone per re-measure. */
export interface HeroSampleSource {
  image: CanvasImageSource
  width: number
  height: number
}

/** Decode `src` for sampling. BROWSER ONLY. Resolves null on any failure (decode error, zero
 *  size), and the caller leaves the zone unmeasured rather than guessing.
 *
 *  `crossOrigin = 'anonymous'` is kept for the remote-URL case, but the intended caller passes
 *  the ALREADY-RENDERED cover's `currentSrc`, which is the same-origin `/_next/image?url=…` the
 *  browser has in cache: canvas-readable with no CORS grant and no second full-res download. */
export async function loadSampleSource(src: string): Promise<HeroSampleSource | null> {
  if (typeof document === 'undefined') return null
  try {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = src
    await img.decode()
    if (!img.naturalWidth || !img.naturalHeight) return null
    return { image: img, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

/** Container-space region → image-space source rect, reproducing `object-fit: cover` plus the
 *  focal point (`object-position`) so a repositioned photo samples the band actually on screen.
 *  Shared by the zone sampler and the section-level fallback so the two can never drift. */
function coverSourceRect(
  region: RegionFraction,
  opts: { imageWidth: number; imageHeight: number; containerWidth: number; containerHeight: number; focus?: string | null },
): { sx: number; sy: number; sw: number; sh: number } | null {
  const iw = opts.imageWidth
  const ih = opts.imageHeight
  if (!iw || !ih) return null
  const cw = Math.max(1, opts.containerWidth)
  const ch = Math.max(1, opts.containerHeight)
  // Scale to fill, then object-position aligns the focal percent of the image with the same
  // percent of the box.
  const scale = Math.max(cw / iw, ch / ih)
  const { x: fx, y: fy } = objectPositionToXY(opts.focus ?? null)
  const offsetX = (cw - iw * scale) * (fx / 100)
  const offsetY = (ch - ih * scale) * (fy / 100)
  const sx0 = Math.max(0, Math.min(iw, (cw * region.x0 - offsetX) / scale))
  const sx1 = Math.max(0, Math.min(iw, (cw * region.x1 - offsetX) / scale))
  const sy0 = Math.max(0, Math.min(ih, (ch * region.y0 - offsetY) / scale))
  const sy1 = Math.max(0, Math.min(ih, (ch * region.y1 - offsetY) / scale))
  const sw = sx1 - sx0
  const sh = sy1 - sy0
  if (sw < 1 || sh < 1) return null
  return { sx: sx0, sy: sy0, sw, sh }
}

/** The tile grid behind one zone: draw the zone's slice of the cover into a cols x rows canvas
 *  (so each canvas pixel IS a box-filtered tile) and return each tile's relative luminance.
 *  BROWSER ONLY; null on any failure, which the caller must treat as "unmeasured". */
export function tileLuminancesFrom(
  source: HeroSampleSource,
  opts: {
    region: RegionFraction
    containerWidth: number
    containerHeight: number
    focus?: string | null
    cols?: number
    rows?: number
  },
): number[] | null {
  if (typeof document === 'undefined') return null
  try {
    const rect = coverSourceRect(opts.region, {
      imageWidth: source.width,
      imageHeight: source.height,
      containerWidth: opts.containerWidth,
      containerHeight: opts.containerHeight,
      focus: opts.focus,
    })
    if (!rect) return null
    const cols = Math.max(1, opts.cols ?? ZONE_TILE_COLS)
    const rows = Math.max(1, opts.rows ?? ZONE_TILE_ROWS)
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(source.image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, cols, rows)
    const data = ctx.getImageData(0, 0, cols, rows).data
    const tiles: number[] = []
    for (let i = 0; i < data.length; i += 4) {
      tiles.push(relativeLuminance(data[i], data[i + 1], data[i + 2]))
    }
    return tiles.length ? tiles : null
  } catch {
    // Tainted canvas (no CORS grant), unsupported source — degrade to unmeasured.
    return null
  }
}

/** Average the relative luminance of the part of `src` that the hero's cover crop shows in
 *  `region` — i.e. the pixels actually behind the text. Reproduces object-fit: cover with the
 *  focal point (object-position), so a repositioned photo samples the right band. BROWSER
 *  ONLY (canvas); resolves null on any failure (no CORS grant, decode error, zero size), and
 *  the caller falls back to overlay-only heuristics plus the scrim.
 *
 *  THE SECTION-LEVEL FALLBACK, still live: a hero with `adaptiveText` but no rendered zones (the
 *  `minimal` variant, any future caller that does not compose the zone markup) has one band and
 *  no per-run geometry, so p85 over that band remains the right robust statistic there. Heroes
 *  that DO render zones go through resolveZoneTone instead. */
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
    const source = await loadSampleSource(src)
    if (!source) return null
    const rect = coverSourceRect(HERO_TEXT_REGION, {
      imageWidth: source.width,
      imageHeight: source.height,
      containerWidth: opts.containerWidth,
      containerHeight: opts.containerHeight,
      focus: opts.focus,
    })
    if (!rect) return null

    const SIZE = 24
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(source.image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, SIZE, SIZE)
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
