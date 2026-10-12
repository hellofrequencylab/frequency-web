import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { WILDHEART_MOTION, WILDHEART_NIGHTSHADE as N, WILDHEART_PALETTE as P, WILDHEART_SEASONS, WILDHEART_SEASON_ORDER, WILDHEART_SHAPE, WILDHEART_SPACE, WILDHEART_TOKENS_CSS, wildheartAccentVars } from './wildheart'

// The tokens-v3 values are final; these measure what the theme's own rules promise of them (the pass-1
// contrast audit, light and Nightshade).
describe('the Wildheart palette reads', () => {
  it('body, secondary, muted and link text clear AA on the parchment page, the vellum card and the aged ground', () => {
    for (const fg of [P.ink, P.secondary, P.muted, P.violetText, P.nightshade]) {
      for (const bg of [P.parchment, P.vellum, P.aged]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('muted text moved for tokens-v3: 5.62:1 on parchment, where the handoff shade was 4.30:1', () => {
    expect(P.muted).toBe('#6B5B51')
    expect(contrastRatio(P.muted, P.parchment)).toBeGreaterThanOrEqual(5.6)
    expect(contrastRatio(P.muted, P.aged)).toBeGreaterThanOrEqual(5.1)
  })

  it('vellum reads on every violet and madder fill INCLUDING each gradient light stop, never white', () => {
    for (const fill of [P.violet, P.violetTop, P.violetPressed, P.madder, P.madderTop, P.madderDeep, P.nightshade, P.nightshadeTop]) expect(contrastRatio(P.vellum, fill), fill).toBeGreaterThanOrEqual(4.5)
    expect(P.madderTop).toBe('#9A5461')
    expect(WILDHEART_TOKENS_CSS).not.toMatch(/#fff\b|#ffffff|#000\b|#000000/i)
  })

  it('reads in Nightshade too: moon, secondary, muted and lilac text on the page and the card, every night season ink', () => {
    for (const fg of [N.moon, N.witch, N.secondary, N.muted, N.lilac, N.rose]) {
      for (const bg of [N.page, N.card, N.raised]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const s of WILDHEART_SEASON_ORDER) expect(contrastRatio(WILDHEART_SEASONS[s].inkNight, N.page), `${s} night ink`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(P.vellum, P.violet)).toBeGreaterThanOrEqual(4.5) // the fills do not change with the mode
    expect(contrastRatio(N.lilac, N.page)).toBeGreaterThanOrEqual(3) // the night focus ring as a graphic
  })

  it('ink reads on every season fill, and every season ink reads on parchment', () => {
    for (const s of WILDHEART_SEASON_ORDER) {
      expect(contrastRatio(P.ink, WILDHEART_SEASONS[s].fill), `ink on ${s}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(WILDHEART_SEASONS[s].ink, P.parchment), `${s} ink on parchment`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps the handoff's four season fills and inks exactly", () => {
    // The handoff calls these the palette shared with Hearts on Fire; the repo's Bold set differs by a few
    // steps per season (lib/theme/menswork.ts), and the handoff's exact values are final for Wildheart.
    expect(Object.fromEntries(WILDHEART_SEASON_ORDER.map((s) => [s, [WILDHEART_SEASONS[s].fill, WILDHEART_SEASONS[s].ink]]))).toEqual({
      winter: ['#A3AEDC', '#46518A'], spring: ['#9DBA86', '#4C6B37'], summer: ['#D8B35E', '#7A5A16'], fall: ['#CC8B74', '#8A4630'],
    })
  })
})

describe('the Wildheart token block', () => {
  it('is scoped to the Wildheart site root and declares one rule per season', () => {
    expect(WILDHEART_TOKENS_CSS).toMatch(/^\s*\[data-house-theme="wildheart"\]\{/)
    for (const s of WILDHEART_SEASON_ORDER) expect(WILDHEART_TOKENS_CSS).toContain(`[data-season="${s}"]`)
  })

  it('carries the petal, arch and pill shapes exactly as the handoff sets them', () => {
    expect(WILDHEART_SHAPE).toEqual({ petalSm: '14px 14px 4px 14px', petalMd: '24px 24px 6px 24px', petalLg: '40px 40px 8px 40px', arch: '999px 999px 24px 24px', pill: '999px' })
    expect(WILDHEART_TOKENS_CSS).toContain(`--radius-card:${WILDHEART_SHAPE.petalMd}`)
    expect(WILDHEART_TOKENS_CSS).toContain(`--radius-cover:${WILDHEART_SHAPE.arch}`)
  })

  it('reads its faces through the site-scoped font variables, never a root layout registration', () => {
    expect(WILDHEART_TOKENS_CSS).toContain('var(--font-wh-fell)')
    expect(WILDHEART_TOKENS_CSS).toContain('var(--font-wh-garamond)')
    expect(WILDHEART_TOKENS_CSS).not.toMatch(/var\(--font-(?:nunito|anton|playfair|sofia-xc|barlow)\)/)
  })

  it('keeps the grain, the washes and breath-paced motion as tokens', () => {
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-grain:url("data:image/svg+xml')
    expect(WILDHEART_TOKENS_CSS).toContain('feTurbulence')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-breath:5s')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-ease:cubic-bezier(.22,.7,.2,1)')
    expect(WILDHEART_MOTION).toMatchObject({ fast: '200ms', base: '320ms', slow: '600ms', rise: '8px', hoverRise: '2px' })
  })

  it('zeroes every motion token under prefers-reduced-motion, in one block', () => {
    expect(WILDHEART_TOKENS_CSS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\[data-house-theme="wildheart"\]\{--wh-dur-fast:0ms;--wh-dur-base:0ms;--wh-dur-slow:0ms;--wh-breath:0s;--wh-rise-y:0px;--wh-hover-rise:0px\}\}/)
  })

  it('composes every gradient, shadow and wash from named stops: the pressed violet is flat, no unnamed hex inside a value', () => {
    const light = WILDHEART_TOKENS_CSS.slice(0, WILDHEART_TOKENS_CSS.indexOf('[data-mode="nightshade"]'))
    for (const m of light.matchAll(/--wh-(?:gradient|wash|shadow|aura|ring|veil|page)[a-z-]*:([^;]+);/g)) expect(m[1], m[0]).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-gradient-violet-pressed:linear-gradient(160deg,var(--wh-violet-pressed),var(--wh-violet-pressed))')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-gradient-vellum:linear-gradient(175deg,var(--wh-vellum) 0%,var(--wh-parchment) 100%)')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-gradient-dusk:linear-gradient(180deg,var(--wh-mist) 0%,var(--wh-blush-top) 55%,var(--wh-parchment) 100%)')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-ring-focus:0 0 0 2px var(--wh-focus-halo),0 0 0 4px var(--wh-focus-ring)')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-shadow-lift:')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-danger:var(--wh-madder)')
  })

  it('carries the rhythm, the page frame and the control heights that drive the petal rule', () => {
    expect(WILDHEART_SPACE.steps).toEqual(['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px', '96px', '128px'])
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-space-10:128px')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-control-sm:34px;--wh-control-md:44px;--wh-control-lg:52px;--wh-touch-min:44px')
    expect(WILDHEART_TOKENS_CSS).toContain('--wh-gutter:16px;--wh-gutter-desktop:48px;--wh-content-max:1200px')
  })

  it('re-points DAWN through the --wh-* set, so Nightshade is one override block that no UI sets yet', () => {
    expect(WILDHEART_TOKENS_CSS).toContain('--color-canvas:var(--wh-parchment)')
    expect(WILDHEART_TOKENS_CSS).toContain('--color-text:var(--wh-ink)')
    expect(WILDHEART_TOKENS_CSS).toContain('--color-text-subtle:var(--wh-muted)')
    const night = WILDHEART_TOKENS_CSS.slice(WILDHEART_TOKENS_CSS.indexOf('[data-house-theme="wildheart"][data-mode="nightshade"]{'))
    expect(night).toContain('color-scheme:dark')
    expect(night).toContain(`--wh-parchment:${N.page};--wh-vellum:${N.card};--wh-aged:${N.raised};--wh-hairline:${N.hairline};--wh-muted:${N.muted};--wh-secondary:${N.secondary};--wh-ink:${N.moon};--wh-border-strong:${N.strong}`)
    expect(night).toContain(`--wh-violet-text:${N.lilac}`)
    expect(night).toContain(`--wh-witch:${N.witch}`)
    expect(night).toContain(`--wh-danger:var(--wh-rose)`)
    for (const s of WILDHEART_SEASON_ORDER) expect(night).toContain(`--wh-season-${s}-ink:${WILDHEART_SEASONS[s].inkNight}`)
    expect(night).not.toMatch(/--wh-violet:|--wh-madder:|--wh-season-winter:|--wh-season-fall:/) // the fills stay
    expect(WILDHEART_TOKENS_CSS).not.toContain('prefers-color-scheme')
  })
})

describe('wildheartAccentVars', () => {
  it('uses the theme violet with a vellum label when the Space set no accent', () => {
    const v = wildheartAccentVars(null)!
    expect(v['--color-primary']).toBe(P.violet)
    expect(v['--color-text-on-primary']).toBe(P.vellum)
    expect(v['--color-primary-strong']).toBe(P.violetText)
  })

  it("keeps the owner's own hex accent, with a label that reads on it", () => {
    expect(wildheartAccentVars('#F2B14E')!['--color-text-on-primary']).toBe(P.ink)
    expect(wildheartAccentVars('#1D3557')!['--color-text-on-primary']).toBe(P.vellum)
  })

  it('wears the theme violet for a DAWN token accent', () => {
    expect(wildheartAccentVars('--color-broadcast')?.['--color-primary']).toBe(P.violet)
  })
})
