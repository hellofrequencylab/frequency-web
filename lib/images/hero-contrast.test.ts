import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  compositeOverSrgb,
  contrastRatio,
  overlayAlphaInTextBand,
  parseCssColor,
  relativeLuminance,
  resolveMediaTone,
  resolveZoneTone,
  srgbDecode,
  srgbEncode,
  zoneRegion,
  HERO_HALO_CONTRAST,
  HERO_PLATE_ALPHAS,
  HERO_TEXT_REGION,
  MIN_HERO_CONTRAST,
  ZONE_TILE_COLS,
  ZONE_TILE_ROWS,
} from './hero-contrast'

// The token pair the hero reads at runtime: on-ink (light cream) and ink (near-black).
const LIGHT_TEXT = relativeLuminance(243, 238, 227) // #F3EEE3
const DARK_TEXT = relativeLuminance(20, 18, 16) // #141210

describe('parseCssColor', () => {
  it('parses hex forms', () => {
    expect(parseCssColor('#fff')).toEqual([255, 255, 255])
    expect(parseCssColor('#141210')).toEqual([20, 18, 16])
    expect(parseCssColor('#14121080')).toEqual([20, 18, 16])
  })

  it('parses rgb()/rgba()', () => {
    expect(parseCssColor('rgb(20, 18, 16)')).toEqual([20, 18, 16])
    expect(parseCssColor('rgba(20 18 16 / 0.5)')).toEqual([20, 18, 16])
  })

  it('returns null for anything else', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor(null)).toBeNull()
    expect(parseCssColor('var(--color-ink)')).toBeNull()
    expect(parseCssColor('#12')).toBeNull()
  })
})

describe('luminance + contrast', () => {
  it('spans black to white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5)
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 0)
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 5)
  })
})

describe('resolveMediaTone', () => {
  const base = {
    overlayLuminance: DARK_TEXT,
    lightTextLuminance: LIGHT_TEXT,
    darkTextLuminance: DARK_TEXT,
  }

  it('renders light text over a dark photo with no overlay', () => {
    const r = resolveMediaTone({ ...base, mediaLuminance: 0.03, overlayStyle: 'none' })
    expect(r.tone).toBe('dark')
    expect(r.scrim).toBe(false)
  })

  it('renders dark text over a bright photo with no overlay (the owner case)', () => {
    const r = resolveMediaTone({ ...base, mediaLuminance: 0.9, overlayStyle: 'none' })
    expect(r.tone).toBe('light')
    expect(r.scrim).toBe(false)
  })

  it('asks for the scrim on a mid-tone photo where neither tone clears the floor', () => {
    const r = resolveMediaTone({ ...base, mediaLuminance: 0.22, overlayStyle: 'none' })
    expect(r.scrim).toBe(r.contrast < 4.5)
  })

  it('a dark shadow overlay flips a bright photo back to light text', () => {
    const r = resolveMediaTone({ ...base, mediaLuminance: 0.9, overlayStyle: 'shadow' })
    expect(r.tone).toBe('dark')
  })

  it('a light fade (canvas) over a dark photo reads as light backdrop → dark text', () => {
    const r = resolveMediaTone({
      ...base,
      mediaLuminance: 0.05,
      overlayStyle: 'fade',
      overlayLuminance: 0.95, // light-mode canvas
    })
    expect(r.tone).toBe('light')
  })

  it('overlay alpha only applies to shadow/fade', () => {
    expect(overlayAlphaInTextBand('none')).toBe(0)
    expect(overlayAlphaInTextBand('shadow')).toBeGreaterThan(overlayAlphaInTextBand('fade'))
  })
})

describe('HERO_TEXT_REGION (the sampled box must match where the copy actually sits)', () => {
  // The production read this pins (owner report, 2026-07-28): the profile name rendered WHITE on the
  // server, then flipped to BLACK after hydration over dark timber, because the sampled band swept
  // most of the cover's lower half and a bright subject right of centre dominated the statistic. The
  // sample must stay inside the lockup's own corner: the left half, low in the frame.
  it('covers the bottom-LEFT corner only, never the right half or the vertical middle', () => {
    expect(HERO_TEXT_REGION.x0).toBe(0)
    expect(HERO_TEXT_REGION.y1).toBe(1)
    expect(HERO_TEXT_REGION.x1).toBeLessThanOrEqual(0.5)
    expect(HERO_TEXT_REGION.y0).toBeGreaterThanOrEqual(0.6)
  })

  it('is a non-empty box', () => {
    expect(HERO_TEXT_REGION.x1).toBeGreaterThan(HERO_TEXT_REGION.x0)
    expect(HERO_TEXT_REGION.y1).toBeGreaterThan(HERO_TEXT_REGION.y0)
  })

  it('samples a worst-case bright percentile, not an arithmetic mean', () => {
    // Guards the statistic itself: a mean is what let a white coat beside dark timber score as
    // "light background" and flip the copy to black. Source-level, since the sampler needs a canvas.
    const src = readFileSync('lib/images/hero-contrast.ts', 'utf8')
    expect(src).toContain('lums.sort((a, b) => a - b)')
    expect(src).toContain('Math.floor(lums.length * 0.85)')
    expect(src).not.toMatch(/return n \? sum \/ n : null/)
  })
})

// ── Per-zone resolution (ADR-894) ────────────────────────────────────────────────────────────

const TILE_COUNT = ZONE_TILE_COLS * ZONE_TILE_ROWS
const BLACK = 0
const WHITE = 1
const TIMBER = relativeLuminance(30, 24, 18) // dark stained wood, the owner's back wall
const COAT = relativeLuminance(228, 224, 216) // the bright subject beside it

/** A zone's tile grid: `brightCount` of the tiles are `bright`, the rest are `dark`. */
function tiles(dark: number, bright: number, brightCount: number): number[] {
  return Array.from({ length: TILE_COUNT }, (_, i) => (i < brightCount ? bright : dark))
}

const ZONE_BASE = {
  overlayStyle: 'none' as const,
  overlayLuminance: DARK_TEXT,
  lightTextLuminance: LIGHT_TEXT,
  darkTextLuminance: DARK_TEXT,
}

describe('sRGB compositing (the colour-space correction, ADR-894)', () => {
  it('round-trips encode/decode', () => {
    expect(srgbDecode(srgbEncode(0.5))).toBeCloseTo(0.5, 6)
    expect(srgbEncode(0)).toBe(0)
    expect(srgbEncode(1)).toBeCloseTo(1, 6)
  })

  it('returns the backdrop untouched at alpha 0 and the layer at alpha 1', () => {
    expect(compositeOverSrgb(0.42, 0.9, 0)).toBe(0.42)
    expect(compositeOverSrgb(0.42, 0.9, 1)).toBe(0.9)
  })

  it('is roughly 4x darker than a linear-light blend for a cream plate on black', () => {
    // THE bug this function exists to prevent. A linear model says 45% cream over a black tile
    // lands at L 0.386 (about 8:1 for dark copy) and the plate ladder was drawn from that. The
    // browser actually composites in gamma-encoded sRGB and renders L 0.148, i.e. 3.5:1 — a plate
    // that was specified as comfortably legible and is not. Pin the real number.
    const linearModel = LIGHT_TEXT * 0.45 + BLACK * 0.55
    const actual = compositeOverSrgb(BLACK, LIGHT_TEXT, HERO_PLATE_ALPHAS[2])
    expect(linearModel / actual).toBeGreaterThan(2.5)
    expect(contrastRatio(actual, DARK_TEXT)).toBeLessThan(MIN_HERO_CONTRAST)
    // ...and the strong rung is what actually clears it.
    expect(contrastRatio(compositeOverSrgb(BLACK, LIGHT_TEXT, HERO_PLATE_ALPHAS[3]), DARK_TEXT))
      .toBeGreaterThan(MIN_HERO_CONTRAST)
  })

  it('keeps the CSS and the model on the same alphas', () => {
    // HERO_PLATE_ALPHAS and the --hero-plate-alpha declarations in globals.css are ONE contract:
    // if they drift, the resolver promises a contrast the paint does not deliver.
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain(`--hero-plate-alpha: ${HERO_PLATE_ALPHAS[2] * 100}%`)
    expect(css).toContain(`--hero-plate-alpha: ${HERO_PLATE_ALPHAS[3] * 100}%`)
    // The composite must stay in plain srgb, because that is what the model assumes. srgb-linear
    // would NOT change the browser's blend (mixing with transparent yields an alpha, and the alpha
    // composite runs in the destination space) but it would suggest the model should change.
    expect(css).toContain('color-mix(in srgb, var(--hero-text-backdrop) var(--hero-plate-alpha), transparent)')
    expect(css).not.toContain('srgb-linear, var(--hero-text-backdrop)')
  })
})

describe('resolveZoneTone — the four covers that decide this design', () => {
  it("🔴 the owner's cover: name over dark timber beside a bright subject resolves to WHITE copy", () => {
    // The lockup zone sits on the timber. This is the read the owner photographed going wrong.
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(TIMBER, COAT, 0) })
    expect(r?.tone).toBe('dark') // 'dark' backdrop -> light (white) copy
    expect(r?.plate).toBe(0) // uniform dark wood needs no treatment at all
  })

  it("🔴 ...and STAYS white when the bright subject bleeds into the zone", () => {
    // 4 of 32 tiles catch the coat. Worst-tile-alone would hand this to BLACK copy (light copy
    // scores 1.13:1 on the coat, dark copy 1.24:1 on the wood) and print the name in black on
    // black timber. Counting passing tiles keeps the answer the reader needs, and the plate
    // rescues the four tiles that fail.
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(TIMBER, COAT, 4) })
    expect(r?.tone).toBe('dark')
    expect(r?.plate).toBeGreaterThanOrEqual(2)
  })

  it('an all-white cover resolves to DARK copy with no plate', () => {
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(WHITE, WHITE, 0) })
    expect(r?.tone).toBe('light')
    expect(r?.plate).toBe(0)
    expect(r?.contrast).toBeGreaterThan(MIN_HERO_CONTRAST)
  })

  it('an all-black cover resolves to WHITE copy with no plate', () => {
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(BLACK, BLACK, 0) })
    expect(r?.tone).toBe('dark')
    expect(r?.plate).toBe(0)
    expect(r?.contrast).toBeGreaterThan(MIN_HERO_CONTRAST)
  })

  it('a 50/50 split takes the strong plate, because no tone can carry it alone', () => {
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(BLACK, WHITE, TILE_COUNT / 2) })
    expect(r?.plate).toBe(3)
    // Whichever tone wins the tie, the strong plate must actually clear the floor on BOTH
    // extremes — that is the promise the rung makes.
    const text = r?.tone === 'dark' ? LIGHT_TEXT : DARK_TEXT
    const plate = r?.tone === 'dark' ? DARK_TEXT : LIGHT_TEXT
    for (const tile of [BLACK, WHITE]) {
      expect(contrastRatio(compositeOverSrgb(tile, plate, HERO_PLATE_ALPHAS[3]), text))
        .toBeGreaterThanOrEqual(MIN_HERO_CONTRAST)
    }
  })
})

describe('resolveZoneTone — the ladder and the contract', () => {
  it('returns null for an unmeasurable zone, which the caller must render as UNMEASURED', () => {
    // Not an error state. An empty result means "leave the data attributes off" so the CSS falls
    // to the halo-only baseline rather than to a tone guess.
    expect(resolveZoneTone({ ...ZONE_BASE, tiles: [] })).toBeNull()
  })

  it('uses the halo, not a rectangle, for a merely marginal zone', () => {
    // A mid-tone that clears large-text AA but not the hero floor: the per-glyph shadow carries
    // it and the photo stays clean.
    const mid = 0.2
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(mid, mid, 0) })
    expect(r?.contrast).toBeGreaterThanOrEqual(HERO_HALO_CONTRAST)
    expect(r?.contrast).toBeLessThan(MIN_HERO_CONTRAST)
    expect(r?.plate).toBe(1)
  })

  it('a dark shadow overlay flips a bright zone back to white copy with no plate', () => {
    const r = resolveZoneTone({ ...ZONE_BASE, tiles: tiles(0.9, 0.9, 0), overlayStyle: 'shadow' })
    expect(r?.tone).toBe('dark')
    expect(r?.plate).toBe(0)
  })

  it('never returns a rung whose alpha is undefined', () => {
    for (const t of [tiles(BLACK, WHITE, 1), tiles(BLACK, WHITE, 16), tiles(0.35, 0.35, 0)]) {
      const r = resolveZoneTone({ ...ZONE_BASE, tiles: t })
      expect(HERO_PLATE_ALPHAS[r!.plate]).toBeTypeOf('number')
    }
  })

  it('grids a zone finely enough that a tile is a few glyphs, not a whole band', () => {
    expect(ZONE_TILE_COLS).toBeGreaterThanOrEqual(8)
    expect(ZONE_TILE_ROWS).toBeGreaterThanOrEqual(4)
  })
})

describe('zoneRegion', () => {
  const host = { left: 0, top: 0, width: 1200, height: 320 }

  it('converts a measured box into the hero its own 0..1 space', () => {
    const r = zoneRegion({ left: 120, top: 210, width: 360, height: 80 }, host)
    expect(r).toEqual({ x0: 0.1, y0: 0.65625, x1: 0.4, y1: 0.90625 })
  })

  it('clamps a zone that overhangs its hero instead of returning nonsense', () => {
    const r = zoneRegion({ left: -40, top: 300, width: 1400, height: 90 }, host)
    expect(r).toEqual({ x0: 0, y0: 0.9375, x1: 1, y1: 1 })
  })

  it('returns null for a degenerate box or a zero-size host', () => {
    expect(zoneRegion({ left: 10, top: 10, width: 0, height: 40 }, host)).toBeNull()
    expect(zoneRegion({ left: 10, top: 10, width: 40, height: 40 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})

describe('per-zone wiring (source-level drift guard)', () => {
  // The atomicity rule, enforced. The CSS reads data-media-tone on .hero-zone while the sensor
  // writes it; ship one without the other and every profile sits in the unmeasured branch
  // permanently, looking finished and doing nothing.
  const hero = readFileSync('components/templates/page-hero.tsx', 'utf8')
  const sensor = readFileSync('components/templates/hero-adaptive-text.tsx', 'utf8')
  const css = readFileSync('app/globals.css', 'utf8')

  it('PageHero emits a zone in EVERY branch that renders text-on-media', () => {
    // The overlay branch is reachable on the profile: the page passes variant={header.layout} and
    // an operator value in /admin/elements wins. An adaptive branch with no zone renders a token
    // nothing ever resolves.
    const zoneMarkers = hero.match(/zoneProps\('(lockup|actions)'/g) ?? []
    expect(zoneMarkers.filter((m) => m.includes('lockup')).length).toBeGreaterThanOrEqual(2)
    expect(zoneMarkers.filter((m) => m.includes('actions')).length).toBeGreaterThanOrEqual(2)
  })

  it('leaves an unmeasured zone with NO tone and NO plate attribute', () => {
    // Absent is the signal. A placeholder value would be a guess, and the light default guessed
    // wrong on a bright cover at about 1.13:1 — the failure this whole effort is about.
    expect(hero).toContain("'data-media-plate': measured ? String(measured.plate) : undefined")
    expect(css).toContain('.hero-adaptive-text .hero-zone:not([data-media-plate])')
  })

  it('tags the cover image so the sensor can never sample the avatar', () => {
    expect(hero).toContain('data-hero-cover')
    expect(sensor).toContain("img[data-hero-cover]")
    expect(sensor).toContain('coverImage ? el.querySelector')
  })

  it('sensor stamps per zone, unifies the rung, and re-measures on resize', () => {
    expect(sensor).toContain("querySelectorAll<HTMLElement>('[data-hero-zone]')")
    expect(sensor).toContain('zone.dataset.mediaTone = result.tone')
    expect(sensor).toContain('zone.dataset.mediaPlate = String(rung)')
    expect(sensor).toContain('new ResizeObserver')
    // Observe the SECTION, never the zones: the plate changes a zone's painted size, so watching
    // a zone is a feedback loop.
    expect(sensor).toContain('observer?.observe(host)')
    expect(sensor).not.toMatch(/observer\?\.observe\(zone/)
  })

  it('keeps the plate BELOW the copy it sits behind', () => {
    // z-index: -1 is load-bearing. .hero-zone is position: relative with z-index auto, so it
    // establishes no stacking context and the pseudo-element paints inside PageHero's z-10
    // content div, above the cover and below the name. Without it the wash lands on the name.
    const plate = css.slice(css.indexOf('.hero-adaptive-text .hero-zone[data-media-plate="2"]::before'))
    expect(plate.slice(0, 400)).toContain('z-index: -1')
  })

  it('gives the on-cover controls a class that reads the ZONE token', () => {
    expect(hero).toContain('HERO_ACTION_CLASS_ADAPTIVE')
    // and never at the cost of the seven non-profile heroes that pin the original byte for byte.
    expect(hero).toContain(
      "'inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold text-on-ink backdrop-blur-sm transition-colors hover:bg-white/20'",
    )
    expect(css).toContain('color: var(--color-on-media);')
  })
})
