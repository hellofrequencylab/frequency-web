import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { SERVICES_ACCENTS, SERVICES_DAY_CSS, SERVICES_ON_ACCENT, SERVICES_TOKENS_CSS, type ServicesAccentId } from './services'

describe('Services theme tokens', () => {
  it('scopes every selector to the stand-alone site render, never :root (theme fence)', () => {
    for (const css of [SERVICES_TOKENS_CSS, SERVICES_DAY_CSS]) {
      expect(css).not.toContain(':root')
      for (const sel of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) expect(sel[1].trim().startsWith('[data-house-theme="services"]'), sel[1]).toBe(true)
    }
  })
  it('names every custom property --sv-* so no other theme meets them', () => {
    for (const name of SERVICES_TOKENS_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)) expect(name[1].startsWith('--sv-'), name[1]).toBe(true)
  })
  it('keeps Day apart from Night so the intake compares Night alone', () => {
    expect(SERVICES_TOKENS_CSS).not.toContain('data-th="day"')
    expect(SERVICES_DAY_CSS).toContain('data-th="day"')
  })
  it('carries ink on every accent preset, at least 4.5:1 (white on Tide is not)', () => {
    for (const id of Object.keys(SERVICES_ACCENTS) as ServicesAccentId[]) expect(contrastRatio(SERVICES_ON_ACCENT, SERVICES_ACCENTS[id].accent), id).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#FFFFFF', SERVICES_ACCENTS.tide.accent)).toBeLessThan(3)
  })
})
