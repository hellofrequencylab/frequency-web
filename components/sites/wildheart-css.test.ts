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

  it('gives every control its states through tokens: one focus ring, a flat press, an aged disabled, a lifted link card', () => {
    expect(skin).toContain(':focus-visible{outline:none;box-shadow:var(--wh-ring-focus)}')
    expect(skin).not.toMatch(/outline:\s*[0-9]/)
    expect(skin).toContain('.hs-btn-primary:active{background:var(--wh-gradient-violet-pressed);box-shadow:none;transform:none}')
    expect(skin).toContain('.hs-btn:is(:disabled,[aria-disabled="true"]){background:var(--wh-aged);color:var(--wh-muted);border-color:var(--wh-hairline);box-shadow:none;cursor:not-allowed')
    expect(skin).toContain('.hs-chip:is(:disabled,[aria-disabled="true"]){background:var(--wh-aged);color:var(--wh-muted)')
    expect(skin).toContain(':is(input,textarea,select):focus{border-color:var(--wh-focus-ring);box-shadow:0 0 0 1px var(--wh-focus-ring),var(--wh-aura)')
    expect(skin).toContain(':is(input,textarea,select)[aria-invalid="true"]{border-color:var(--wh-danger)')
    expect(skin).toContain(':is(input,textarea,select):disabled{background:var(--wh-aged);color:var(--wh-muted)')
    expect(skin).toContain('.hs-cards .hs-card:hover{box-shadow:var(--wh-shadow-lift);transform:translateY(calc(var(--wh-hover-rise) * -1))}')
    expect(skin).toContain('.hs-cards .hs-card:active{box-shadow:var(--wh-shadow-soft);transform:none}')
    expect(skin).not.toMatch(/transform:scale|translateY\(-?[0-9]/) // no scale on press, no literal rise
  })

  it('sets the petal by element height: controls and the default input sm, text areas and cards md, the big surfaces lg', () => {
    expect(skin).toContain('.hs-btn-primary{height:var(--wh-control-lg)')
    expect(skin).toContain(':is(input,textarea,select){min-height:var(--wh-control-md);border-radius:var(--wh-petal-sm)')
    expect(skin).toContain('.hs-card textarea{border-radius:var(--wh-petal-md)}')
    expect(skin).toMatch(/\.hs-card\{[^}]*border-radius:var\(--wh-petal-md\)/)
    for (const big of ['.hs-start{', '.hs-panel{', '.hs-band{', '.hs-contact{']) expect(skin.slice(skin.indexOf(big)).split('}')[0]).toContain('border-radius:var(--wh-petal-lg)')
  })

  it('colours headlines with the witch token, so the Nightshade block re-points them without a sheet change', () => {
    expect(skin).not.toContain('color:var(--wh-nightshade)')
    expect(skin).toMatch(/\.hs-h1,\[data-house-theme="wildheart"\] \.hs-h2,\[data-house-theme="wildheart"\] \.hs-brand\{[^}]*color:var\(--wh-witch\)/)
  })

  it('draws the date line and the calendar family, and honours reduced motion', () => {
    for (const c of ['.wh-nowline', '.wh-glyph', '.wh-moon', '.wh-journey', '.wh-wheel', '.wh-row', '.wh-skymap-months']) expect(skin).toContain(c)
    expect(skin).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\[data-house-theme="wildheart"\] \*\{transition:none!important;animation:none!important\}\}/)
  })
})
