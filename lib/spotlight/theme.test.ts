import { describe, it, expect } from 'vitest'
import {
  validateSpotlightTheme,
  spotlightThemeStyles,
  buildGradientCss,
  readableOn,
  EMPTY_THEME,
} from './theme'

describe('validateSpotlightTheme — read-side boundary', () => {
  it('never throws on garbage and returns the empty theme', () => {
    for (const junk of [null, undefined, 42, 'x', [], { accent: {} }]) {
      expect(() => validateSpotlightTheme(junk)).not.toThrow()
    }
    expect(validateSpotlightTheme(null)).toEqual(EMPTY_THEME)
  })

  it('drops non-hex colours (no raw CSS survives)', () => {
    const out = validateSpotlightTheme({
      accent: 'red; background:url(evil)',
      surface: 'rgb(0,0,0)', // not strict #rrggbb → dropped
      text: '#ABC123',
    })
    expect(out.accent).toBeNull()
    expect(out.surface).toBeNull()
    expect(out.text).toBe('#abc123')
  })

  it('gradient needs >= 2 valid hex stops; clamps angle + pos; drops bad stops', () => {
    const out = validateSpotlightTheme({
      bg: { kind: 'gradient', gradient: { type: 'linear', angle: 999, stops: [
        { color: '#ffffff', pos: -10 },
        { color: 'javascript:alert(1)', pos: 50 },
        { color: '#000000', pos: 999 },
      ] } },
    })
    expect(out.bg.kind).toBe('gradient')
    if (out.bg.kind === 'gradient') {
      expect(out.bg.gradient.angle).toBe(360)
      expect(out.bg.gradient.stops).toHaveLength(2) // the javascript: stop dropped
      expect(out.bg.gradient.stops[0].pos).toBe(0)
      expect(out.bg.gradient.stops[1].pos).toBe(100)
    }
  })

  it('a gradient with < 2 valid stops collapses to no background', () => {
    const out = validateSpotlightTheme({
      bg: { kind: 'gradient', gradient: { stops: [{ color: '#fff', pos: 0 }, { color: 'nope', pos: 100 }] } },
    })
    expect(out.bg.kind).toBe('none')
  })

  it('unknown font / card values fall back to defaults; new font ids are accepted', () => {
    const out = validateSpotlightTheme({
      font: { heading: 'comic-sans', body: 'script' }, // script is a real allowlisted id now
      card: { radius: 'huge', shadow: 'glow', style: 'hologram' },
    })
    expect(out.font.heading).toBe('sans')
    expect(out.font.body).toBe('script')
    expect(out.card).toEqual({ radius: 'lg', shadow: 'soft', style: 'solid' })
  })

  it('gradient animation: coerces animated to a real boolean and clamps speed to 4..40', () => {
    const fast = validateSpotlightTheme({ bg: { kind: 'gradient', gradient: { animated: 'yes', speed: 1, stops: [{ color: '#ffffff', pos: 0 }, { color: '#000000', pos: 100 }] } } })
    expect(fast.bg.kind).toBe('gradient')
    if (fast.bg.kind === 'gradient') {
      expect(fast.bg.gradient.animated).toBe(false) // a non-true value is not animated
      expect(fast.bg.gradient.speed).toBe(4) // clamped up from 1
    }
    const slow = validateSpotlightTheme({ bg: { kind: 'gradient', gradient: { animated: true, speed: 999, stops: [{ color: '#ffffff', pos: 0 }, { color: '#000000', pos: 100 }] } } })
    if (slow.bg.kind === 'gradient') {
      expect(slow.bg.gradient.animated).toBe(true)
      expect(slow.bg.gradient.speed).toBe(40)
    }
  })

  it('an animated gradient emits the pan animation inline', () => {
    const s = spotlightThemeStyles(validateSpotlightTheme({
      bg: { kind: 'gradient', gradient: { animated: true, speed: 9, stops: [{ color: '#ff0000', pos: 0 }, { color: '#0000ff', pos: 100 }] } },
    }))
    const w = s.wrapper as Record<string, string>
    expect(w.animation).toContain('spotlight-bg-pan 9s')
    expect(w.backgroundSize).toBe('300% 300%')
  })
})

describe('builders', () => {
  it('buildGradientCss composes from validated parts only', () => {
    expect(buildGradientCss({ type: 'linear', angle: 90, animated: false, speed: 12, stops: [{ color: '#ff0000', pos: 0 }, { color: '#0000ff', pos: 100 }] }))
      .toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)')
    expect(buildGradientCss({ type: 'radial', angle: 0, animated: false, speed: 12, stops: [{ color: '#fff', pos: 0 }, { color: '#000', pos: 100 }] }))
      .toContain('radial-gradient(')
  })

  it('readableOn picks dark text on light, light text on dark', () => {
    expect(readableOn('#ffffff')).toBe('#111111')
    expect(readableOn('#000000')).toBe('#ffffff')
  })

  it('spotlightThemeStyles is a no-op for the empty theme (page unchanged)', () => {
    const s = spotlightThemeStyles(EMPTY_THEME)
    expect(s.hasTheme).toBe(false)
    expect(s.wrapper).toEqual({})
    expect(s.card).toEqual({})
  })

  it('spotlightThemeStyles emits validated custom properties + a built gradient', () => {
    const s = spotlightThemeStyles(validateSpotlightTheme({
      accent: '#ff6b6b',
      bg: { kind: 'gradient', gradient: { type: 'linear', angle: 160, stops: [{ color: '#ff9a3c', pos: 0 }, { color: '#7b2ff7', pos: 100 }] } },
    }))
    expect(s.hasTheme).toBe(true)
    const w = s.wrapper as Record<string, string>
    expect(w['--color-primary']).toBe('#ff6b6b')
    expect(w.backgroundImage).toContain('linear-gradient(160deg')
    // a readable text colour is always derived
    expect(w['--color-text']).toMatch(/^#(111111|ffffff)$/)
  })
})
