import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  overlayAlphaInTextBand,
  parseCssColor,
  relativeLuminance,
  resolveMediaTone,
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
