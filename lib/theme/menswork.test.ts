import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { MENSWORK_PALETTE as P, MENSWORK_SEASONS, MENSWORK_TOKENS_CSS, mensworkAccentVars, mensworkSeason } from './menswork'

describe('mensworkSeason', () => {
  it('turns on the solstice and equinox lines of the program year', () => {
    const at = (m: number, d: number) => mensworkSeason(new Date(Date.UTC(2027, m - 1, d)))
    expect([at(1, 15), at(3, 19), at(3, 20), at(6, 20), at(6, 21), at(9, 21), at(9, 22), at(12, 20), at(12, 21)]).toEqual([
      'winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'fall', 'fall', 'winter',
    ])
  })
})

describe('the Menswork palette reads', () => {
  it('body, muted and teal text clear AA on the charcoal page and the card surface', () => {
    for (const fg of [P.primary, P.secondary, P.muted, P.tealText]) {
      for (const bg of [P.charcoal, P.surface]) expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('every season accent reads as text on charcoal and takes a charcoal label', () => {
    for (const hex of Object.values(MENSWORK_SEASONS)) expect(contrastRatio(hex, P.charcoal)).toBeGreaterThanOrEqual(4.5)
  })

  it('declares one rule per season', () => {
    for (const s of Object.keys(MENSWORK_SEASONS)) expect(MENSWORK_TOKENS_CSS).toContain(`[data-season="${s}"]`)
  })
})

describe('mensworkAccentVars', () => {
  it('uses the theme teal with a charcoal label when the Space set no accent', () => {
    const v = mensworkAccentVars(null)!
    expect(v['--color-primary']).toBe(P.teal)
    expect(v['--color-text-on-primary']).toBe(P.charcoal)
    expect(contrastRatio(P.charcoal, P.teal)).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps the owner's own hex accent, with a label that reads on it", () => {
    const light = mensworkAccentVars('#F2B14E')!
    expect(light['--color-primary']).toBe('#F2B14E')
    expect(light['--color-text-on-primary']).toBe(P.charcoal)
    const dark = mensworkAccentVars('#1D3557')!
    expect(dark['--color-text-on-primary']).toBe('#FFFFFF')
  })

  it("passes a DAWN token accent through the house builder", () => {
    expect(mensworkAccentVars('--color-signal')?.['--color-primary']).toMatch(/var\(--color-signal/)
  })
})
