import { describe, expect, it } from 'vitest'
import { HOUSE_CSS } from './house-css'
import { WILDHEART_CSS } from './wildheart-css'
import { WILDHEART_TOKENS_CSS } from '@/lib/theme/wildheart'

// The Wildheart website skin has to dress EVERY house section, like the Bold skin (menswork-css.test.ts): a
// house class the skin never restyles would render in the house look on a Wildheart site.

const classes = (css: string) => new Set(css.match(/\.hs-[a-z0-9-]+/g))

const LAYOUT_ONLY = new Set(['.hs-stack', '.hs-header-actions', '.hs-brand-name', '.hs-menu', '.hs-hero-actions', '.hs-start-who', '.hs-steps', '.hs-photo-tall', '.hs-stats', '.hs-stats-grid'])

const skin = WILDHEART_CSS.slice(WILDHEART_TOKENS_CSS.length)

describe('the Wildheart website skin', () => {
  it('restyles every house class that carries a look', () => {
    const own = classes(WILDHEART_CSS)
    const missing = [...classes(HOUSE_CSS)].filter((c) => !own.has(c) && !LAYOUT_ONLY.has(c))
    expect(missing).toEqual([])
  })

  it('scopes every rule under the Wildheart root, so no other website changes', () => {
    const selectors = skin
      .replace(/\{[^}]*\}/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@') && s !== '}' && !/^\d+%|^from$|^to$/.test(s) && !/^(?:0%|100%|50%),?/.test(s))
    // Split on the commas between selectors, not the ones inside an `:is(...)` group.
    const unscoped = selectors.flatMap((line) => line.split(/,(?![^(]*\))/).map((s) => s.trim())).filter((s) => s && !s.includes('[data-house-theme="wildheart"]') && !/^\d/.test(s))
    expect(unscoped).toEqual([])
  })

  it('hardcodes no colour: every value is a token, so a token round is a values-only change', () => {
    expect(skin).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(skin).not.toMatch(/rgba?\(/)
  })

  it('wears the petal, the arch and the pill through tokens, never a chamfer', () => {
    expect(skin).toContain('.hs-btn{position:relative;border-radius:var(--wh-petal-sm)')
    expect(skin).toContain('.hs-photo{border-radius:var(--wh-arch)')
    expect(skin).toContain('.hs-chip{')
    expect(skin).toMatch(/\.hs-chip\{[^}]*border-radius:var\(--wh-pill\)/)
    expect(skin).not.toMatch(/clip-path:polygon/)
  })

  it('draws the date line and the calendar family, and honours reduced motion', () => {
    for (const c of ['.wh-nowline', '.wh-glyph', '.wh-moon', '.wh-journey', '.wh-wheel', '.wh-row', '.wh-skymap-months']) expect(skin).toContain(c)
    expect(skin).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\[data-house-theme="wildheart"\] \*\{transition:none!important;animation:none!important\}\}/)
  })
})
