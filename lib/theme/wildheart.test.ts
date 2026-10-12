import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { WILDHEART_PALETTE as P, WILDHEART_SEASONS, WILDHEART_SEASON_ORDER, WILDHEART_SHAPE, WILDHEART_TOKENS_CSS, wildheartAccentVars } from './wildheart'

// The handoff's values are final; these measure what the theme's own rules promise of them.
describe('the Wildheart palette reads', () => {
  it('body, secondary and link text clear AA on the parchment page and the vellum card', () => {
    for (const fg of [P.ink, P.secondary, P.violetText, P.nightshade]) {
      for (const bg of [P.parchment, P.vellum]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('muted text is a label shade: it clears AA for large text on both grounds', () => {
    for (const bg of [P.parchment, P.vellum]) expect(contrastRatio(P.muted, bg)).toBeGreaterThanOrEqual(3)
  })

  it('vellum reads on every violet and madder fill, never white', () => {
    for (const fill of [P.violet, P.violetPressed, P.madder, P.nightshade]) expect(contrastRatio(P.vellum, fill), fill).toBeGreaterThanOrEqual(4.5)
    expect(WILDHEART_TOKENS_CSS).not.toMatch(/#fff\b|#ffffff|#000\b|#000000/i)
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
