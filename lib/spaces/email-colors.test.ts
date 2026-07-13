import { describe, it, expect } from 'vitest'
import { DEFAULT_EMAIL_COLORS } from '@/lib/email-studio/render'
import {
  spaceEmailColors,
  spaceEmailColorDefaults,
  brandEmailColors,
  readSpaceEmailStyle,
  sanitizeSpaceEmailStyle,
  nextEmailStylePreferences,
  EMAIL_COLOR_KEYS,
} from './email-colors'

// Unit tests for the pure per-Space email palette resolver (deliverable 1). No IO — every function is pure.

const HEX = /^#[0-9a-fA-F]{6}$/

describe('brandEmailColors', () => {
  it('maps a hex brand accent onto the primary family only', () => {
    const brand = brandEmailColors('#3366cc')
    expect(brand.primary).toBe('#3366cc')
    expect(brand.primaryStrong).toMatch(HEX)
    expect(brand.primaryBg).toMatch(HEX)
    expect(brand.onPrimary).toMatch(HEX)
    // It contributes ONLY the primary family — never the neutral slots.
    expect(brand.canvas).toBeUndefined()
    expect(brand.text).toBeUndefined()
  })

  it('darkens primaryStrong and lightens primaryBg relative to the accent', () => {
    // #3366cc → strong is darker (toward black), bg is much lighter (toward white).
    const { primaryStrong, primaryBg } = brandEmailColors('#3366cc')
    // primaryStrong red channel < accent red channel (0x33 = 51).
    expect(parseInt(primaryStrong!.slice(1, 3), 16)).toBeLessThan(0x33)
    // primaryBg is a soft tint: every channel is high (close to white).
    expect(parseInt(primaryBg!.slice(1, 3), 16)).toBeGreaterThan(0xcc)
  })

  it('picks readable ink: white on a dark accent, near-black on a light accent', () => {
    expect(brandEmailColors('#0a0a0a').onPrimary).toBe('#ffffff')
    expect(brandEmailColors('#ffe680').onPrimary).toBe('#141414')
  })

  it('returns nothing for a non-hex (token) accent, or an absent one', () => {
    expect(brandEmailColors('--color-signal')).toEqual({})
    expect(brandEmailColors(null)).toEqual({})
    expect(brandEmailColors(undefined)).toEqual({})
    expect(brandEmailColors('#fff')).toEqual({}) // 3-digit is not accepted
    expect(brandEmailColors('not a color')).toEqual({})
  })
})

describe('readSpaceEmailStyle', () => {
  it('keeps only known keys with strict 6-digit hex values', () => {
    const style = readSpaceEmailStyle({
      emailStyle: {
        canvas: '#101010',
        primary: '#abcdef',
        text: 'red', // not a hex — dropped
        bogusKey: '#000000', // unknown key — dropped
        border: '#fff', // 3-digit — dropped
      },
    })
    expect(style).toEqual({ canvas: '#101010', primary: '#abcdef' })
  })

  it('is tolerant of any malformed shape', () => {
    expect(readSpaceEmailStyle(null)).toEqual({})
    expect(readSpaceEmailStyle('nope')).toEqual({})
    expect(readSpaceEmailStyle([])).toEqual({})
    expect(readSpaceEmailStyle({ emailStyle: null })).toEqual({})
    expect(readSpaceEmailStyle({ emailStyle: ['#000000'] })).toEqual({})
    expect(readSpaceEmailStyle({})).toEqual({})
  })

  it('sanitizeSpaceEmailStyle validates a raw client bag the same way', () => {
    expect(sanitizeSpaceEmailStyle({ primary: '#123456', nope: 1 })).toEqual({ primary: '#123456' })
    expect(sanitizeSpaceEmailStyle('garbage')).toEqual({})
  })
})

describe('spaceEmailColors — the layered resolver', () => {
  it('returns the platform default for a bare / brandless Space', () => {
    expect(spaceEmailColors(null)).toEqual(DEFAULT_EMAIL_COLORS)
    expect(spaceEmailColors({})).toEqual(DEFAULT_EMAIL_COLORS)
    expect(spaceEmailColors({ brandAccent: null, preferences: {} })).toEqual(DEFAULT_EMAIL_COLORS)
  })

  it('folds a hex brand accent onto the primary family, keeping every other default slot', () => {
    const colors = spaceEmailColors({ brandAccent: '#3366cc' })
    expect(colors.primary).toBe('#3366cc')
    expect(colors.onPrimary).toMatch(HEX)
    // Neutral slots are untouched (per-field fallback to the default).
    expect(colors.canvas).toBe(DEFAULT_EMAIL_COLORS.canvas)
    expect(colors.text).toBe(DEFAULT_EMAIL_COLORS.text)
    expect(colors.border).toBe(DEFAULT_EMAIL_COLORS.border)
  })

  it('lets a per-field operator override win over the brand-derived and default values', () => {
    const colors = spaceEmailColors({
      brandAccent: '#3366cc',
      preferences: { emailStyle: { primary: '#ff0000', canvas: '#000000' } },
    })
    expect(colors.primary).toBe('#ff0000') // override beats brand-derived
    expect(colors.canvas).toBe('#000000') // override beats default
    // A slot the override did not touch keeps the brand-derived value.
    expect(colors.primaryStrong).toBe(brandEmailColors('#3366cc').primaryStrong)
  })

  it('always returns a complete EmailColors (every key present, every value a hex)', () => {
    const colors = spaceEmailColors({ brandAccent: '#3366cc', preferences: { emailStyle: { primary: '#ff0000' } } })
    for (const key of EMAIL_COLOR_KEYS) {
      expect(colors[key]).toMatch(HEX)
    }
  })
})

describe('spaceEmailColorDefaults', () => {
  it('is the brand-derived seed WITHOUT the operator override (what "reset" returns to)', () => {
    const defaults = spaceEmailColorDefaults({
      brandAccent: '#3366cc',
      preferences: { emailStyle: { primary: '#ff0000' } },
    })
    // The override is ignored: primary is the brand accent, not the tuned red.
    expect(defaults.primary).toBe('#3366cc')
    expect(defaults.canvas).toBe(DEFAULT_EMAIL_COLORS.canvas)
  })
})

describe('nextEmailStylePreferences', () => {
  it('writes only the emailStyle node, preserving every other preference key', () => {
    const next = nextEmailStylePreferences({ hero: { height: 'tall' } }, { primary: '#123456' })
    expect(next).toEqual({ hero: { height: 'tall' }, emailStyle: { primary: '#123456' } })
  })

  it('clears the emailStyle node when the override is empty', () => {
    const next = nextEmailStylePreferences({ hero: { height: 'tall' }, emailStyle: { primary: '#123456' } }, {})
    expect(next).toEqual({ hero: { height: 'tall' } })
    expect(next.emailStyle).toBeUndefined()
  })
})
