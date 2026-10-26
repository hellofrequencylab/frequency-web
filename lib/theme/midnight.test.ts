import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { contrastRatio } from '@/lib/spaces/accent'
import contract from '@/lib/sites/editor/theme-contract.json'
import { MIDNIGHT_ACCENT, MIDNIGHT_PALETTE as P, MIDNIGHT_SEASONS, MIDNIGHT_TOKENS_CSS, midnightAccentVars } from './midnight'
import { websiteThemeVars, WEBSITE_THEME_FONT_VARS } from '@/lib/sites/editor/theme'
import { midnightSitePages } from '@/lib/sites/midnight-home'

describe('the Midnight theme tokens', () => {
  it('reads at AA wherever text meets a ground', () => {
    for (const fg of [P.bone50, P.bone100, P.ash200, P.ash300, MIDNIGHT_ACCENT.text]) {
      for (const bg of [P.black0, P.black50, P.black100, P.black200]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(MIDNIGHT_ACCENT.on, MIDNIGHT_ACCENT.accent), 'label on violet').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(P.black50, P.bone50), 'label on the bone button').toBeGreaterThanOrEqual(4.5)
  })

  it('defaults to the violet, keeps an owner hex and measures its label', () => {
    expect(midnightAccentVars(null)['--color-primary']).toBe('#A68BF2')
    expect(midnightAccentVars('#a68bf2')['--color-primary']).toBe('#A68BF2')
    expect(midnightAccentVars(null)['--color-text-on-primary']).toBe('#050505')
    const custom = midnightAccentVars('#2F6E80')
    expect(custom['--color-primary']).toBe('#2F6E80')
    expect(contrastRatio(custom['--color-text-on-primary'], '#2F6E80')).toBeGreaterThanOrEqual(4.5)
  })

  it('scopes the block to the Midnight root, leaves the accent to the Space and zeroes motion', () => {
    expect(MIDNIGHT_TOKENS_CSS).toMatch(/^\s*\[data-house-theme="midnight"\]\{/)
    expect(MIDNIGHT_TOKENS_CSS).not.toMatch(/--color-primary[a-z-]*:/)
    expect(MIDNIGHT_TOKENS_CSS).toContain('var(--font-mn-bodoni)')
    expect(MIDNIGHT_TOKENS_CSS).toMatch(/prefers-reduced-motion:reduce\)\{\[data-house-theme="midnight"\]\{--mn-dur-fast:0ms/)
  })

  it('matches the editor contract, so the canvas wears the same values as the site', () => {
    const vars = websiteThemeVars('Midnight', null) as Record<string, string>
    for (const [key, value] of Object.entries(contract.themes.Midnight)) if (typeof value === 'string') expect(vars[key]).toBe(value)
    expect(contract.themes.Midnight['--th-accent']).toBe(MIDNIGHT_ACCENT.accent)
    expect(contract.themes.Midnight.seasons).toEqual(MIDNIGHT_SEASONS)
    expect(WEBSITE_THEME_FONT_VARS.Midnight).toEqual(['mn-bodoni', 'mn-geist', 'mn-marcellus'])
    expect((websiteThemeVars('Midnight', '#2F6E80') as Record<string, string>)['--th-accent']).toBe('#2F6E80')
  })

  it('ships every photo the page set points at', () => {
    const urls = JSON.stringify(midnightSitePages()).match(/\/sites\/midnight\/photos\/[a-z-]+\.jpg/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of new Set(urls)) expect(existsSync(`public${u}`), u).toBe(true)
  })
})
