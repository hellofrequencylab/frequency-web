import { describe, expect, it } from 'vitest'
import { HOUSE_CSS } from './house-css'
import { TEMPLE_CSS } from './temple-css'
import { TEMPLE_TOKENS_CSS } from '@/lib/theme/temple'

// The Temple website skin has to dress EVERY house section, like the Bold, Wildheart and Network skins: a
// house class the skin never restyles would render in the house look on a Temple site.

const classes = (css: string) => new Set(css.match(/\.hs-[a-z0-9-]+/g))

/** Classes that only lay out, or that a themed site never draws (the Menswork season bar, Wildheart ornaments). */
const LAYOUT_ONLY = new Set(['.hs-stack', '.hs-brand-name', '.hs-menu', '.hs-hero-actions', '.hs-start-who', '.hs-stats', '.hs-stats-grid', '.hs-split', '.hs-plain', '.hs-mega', '.hs-mega-desc', '.hs-mega-feature-desc', '.hs-mega-feature-shade', '.hs-hero-copy', '.hs-footer-brand', '.hs-band-body', '.hs-wide'])

const skin = TEMPLE_CSS.slice(TEMPLE_TOKENS_CSS.length)

describe('the Temple website skin', () => {
  it('restyles every house class that carries a look', () => {
    const own = classes(TEMPLE_CSS)
    const missing = [...classes(HOUSE_CSS)].filter((c) => !own.has(c) && !LAYOUT_ONLY.has(c))
    expect(missing).toEqual([])
  })

  it('scopes every rule under the Temple root, so no other website changes', () => {
    const selectors = skin
      .replace(/\{[^}]*\}/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@') && !s.startsWith('/*') && s !== '}' && !/^\d+%|^from$|^to$/.test(s))
    const unscoped = selectors.flatMap((line) => line.split(/,(?![^(]*\))/).map((s) => s.trim())).filter((s) => s && !s.includes('[data-house-theme="temple"]') && !/^\d/.test(s))
    expect(unscoped).toEqual([])
  })

  it('hardcodes no colour: every value is a token, so a token round is a values-only change', () => {
    expect(skin).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(skin).not.toMatch(/rgba?\(/)
  })

  it('hardcodes no size the design system names: radii, shadows, ease and durations are tokens', () => {
    expect(skin).not.toMatch(/cubic-bezier/)
    expect(skin).not.toMatch(/\d+ms\b/)
    expect(skin).not.toMatch(/box-shadow:0 \d/)
  })

  it('wears the arch, the clay and the faces through tokens', () => {
    expect(skin).toContain('.hs-photo{position:relative;aspect-ratio:4 / 4.6;border-radius:var(--tp-r-arch)')
    expect(skin).toContain('.hs-btn-primary{padding:16px 30px;font-size:16px;background:var(--tp-clay-500)')
    expect(skin).toContain('font-family:var(--tp-display)')
    expect(skin).toContain('font-family:var(--tp-serif)')
    expect(skin).toContain('font-family:var(--tp-quote)')
  })

  it('stops its motion under reduced motion', () => {
    expect(skin).toContain('@media (prefers-reduced-motion:reduce)')
    expect(TEMPLE_TOKENS_CSS).toMatch(/prefers-reduced-motion:reduce\)\{\[data-house-theme="temple"\]\{--tp-dur-instant:0ms/)
  })
})
