import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import contract from '@/lib/sites/editor/theme-contract.json'
import { TEMPLE_ACCENT, TEMPLE_PALETTE as P, TEMPLE_SEASONS, TEMPLE_TOKENS_CSS, templeAccentVars } from './temple'
import { websiteThemeVars, WEBSITE_THEME_FONT_VARS } from '@/lib/sites/editor/theme'

describe('the Temple theme tokens', () => {
  it('reads at AA wherever text meets a ground', () => {
    for (const fg of [P.umber900, P.umber800, P.umber600, TEMPLE_ACCENT.mutedText, TEMPLE_ACCENT.text]) {
      for (const bg of [P.plaster100, P.plaster50, P.card, P.plaster200]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const fg of [P.plaster100, P.plaster300, P.saffron400]) expect(contrastRatio(fg, P.umber900), `${fg} on umber`).toBeGreaterThanOrEqual(4.5)
    for (const fg of [P.plaster100, P.plaster300]) expect(contrastRatio(fg, P.aegean800), `${fg} on aegean`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(TEMPLE_ACCENT.on, TEMPLE_ACCENT.accent), 'label on clay').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(P.clay700, P.clay100), 'badge').toBeGreaterThanOrEqual(4.5)
  })

  it('defaults to the clay, keeps an owner hex and measures its label', () => {
    expect(templeAccentVars(null)['--color-primary']).toBe('#B75C3C')
    expect(templeAccentVars('#b75c3c')['--color-primary']).toBe('#B75C3C')
    expect(templeAccentVars(null)['--color-text-on-primary']).toBe('#FFFFFF')
    const custom = templeAccentVars('#1D4451')
    expect(custom['--color-primary']).toBe('#1D4451')
    expect(contrastRatio(custom['--color-text-on-primary'], '#1D4451')).toBeGreaterThanOrEqual(4.5)
    const light = templeAccentVars('#F0D9A8')
    expect(contrastRatio(light['--color-text-on-primary'], '#F0D9A8')).toBeGreaterThanOrEqual(4.5)
  })

  it('scopes the block to the Temple root, leaves the accent to the Space and zeroes motion', () => {
    expect(TEMPLE_TOKENS_CSS).toMatch(/^\s*\[data-house-theme="temple"\]\{/)
    expect(TEMPLE_TOKENS_CSS).not.toMatch(/--color-primary[a-z-]*:/)
    expect(TEMPLE_TOKENS_CSS).toContain('var(--font-tp-branch)')
  })

  it('carries every token family the design system names', () => {
    for (const token of ['--tp-plaster-100', '--tp-umber-900', '--tp-clay-500', '--tp-saffron-500', '--tp-olive-500', '--tp-aegean-800', '--tp-fig-700', '--tp-text-6xl', '--tp-tracking-eyebrow', '--tp-s40', '--tp-gutter', '--tp-container', '--tp-r-arch', '--tp-r-arch-soft', '--tp-r-keyhole', '--tp-r-lozenge', '--tp-d1', '--tp-d3', '--tp-shadow-xl', '--tp-ring', '--tp-wash-sun', '--tp-wash-night', '--tp-ease', '--tp-dur-veil', '--tp-press', '--tp-lift', '--tp-sand', '--tp-grit', '--tp-stucco', '--tp-palm-fan', '--tp-rays']) {
      expect(TEMPLE_TOKENS_CSS, token).toContain(`${token}:`)
    }
  })

  it('matches the editor contract, so the canvas wears the same values as the site', () => {
    const vars = websiteThemeVars('Temple', null) as Record<string, string>
    for (const [key, value] of Object.entries(contract.themes.Temple)) if (typeof value === 'string') expect(vars[key]).toBe(value)
    expect(contract.themes.Temple['--th-accent']).toBe(TEMPLE_ACCENT.accent)
    expect(contract.themes.Temple.seasons).toEqual(TEMPLE_SEASONS)
    expect(WEBSITE_THEME_FONT_VARS.Temple).toEqual(['tp-branch', 'tp-jost', 'tp-marcellus'])
    expect((websiteThemeVars('Temple', '#1D4451') as Record<string, string>)['--th-accent']).toBe('#1D4451')
  })
})
