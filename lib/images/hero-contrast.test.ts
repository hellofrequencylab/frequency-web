import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  contrastRatio,
  overlayAlphaInTextBand,
  parseCssColor,
  relativeLuminance,
  resolveMediaTone,
  HERO_TEXT_REGION,
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
