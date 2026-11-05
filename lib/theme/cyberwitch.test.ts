import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { CYBERWITCH_ACCENTS, CYBERWITCH_ACCENT_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_ON_ACCENT, CYBERWITCH_SURFACE, CYBERWITCH_TOKENS_CSS, cyberwitchAccentId, cyberwitchAccentVars, withCyberWitchAccentPhotos, type CyberWitchAccentId } from './cyberwitch'

const SHEETS = [CYBERWITCH_TOKENS_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_ACCENT_CSS]

describe('CyberWitch theme tokens', () => {
  it('scopes every selector to the stand-alone site render, never :root (theme fence)', () => {
    for (const css of SHEETS) {
      expect(css).not.toContain(':root')
      for (const sel of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) expect(sel[1].trim().startsWith('[data-house-theme="cyberwitch"]'), sel[1]).toBe(true)
    }
  })
  it('declares every custom property as --cw-* so no other theme meets them', () => {
    for (const css of SHEETS) for (const decl of css.matchAll(/(?:^|[;{\n])\s*(--[a-z0-9-]+)\s*:/g)) expect(decl[1].startsWith('--cw-'), decl[1]).toBe(true)
  })
  it('is dark only: no Day register is written anywhere', () => {
    for (const css of SHEETS) expect(css).not.toContain('data-th="day"')
  })
  it('offers Hex, Absinthe, Ice, Blood and Venom, and no violet (Volt stays out, ADR-1792)', () => {
    expect(Object.keys(CYBERWITCH_ACCENTS)).toEqual(['hex', 'absinthe', 'ice', 'blood', 'venom'])
    expect(Object.keys(CYBERWITCH_ACCENTS)).not.toContain('volt')
  })
  it('carries ink on every filled accent, at least 4.5:1', () => {
    for (const id of Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[]) expect(contrastRatio(CYBERWITCH_ON_ACCENT, CYBERWITCH_ACCENTS[id].accent), id).toBeGreaterThanOrEqual(4.5)
    expect(CYBERWITCH_SURFACE.accent.accent).toBe(CYBERWITCH_ACCENTS.hex.accent)
  })
  it('reads accent text at 4.5:1 on the iron page for every preset', () => {
    for (const id of Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[]) expect(contrastRatio(CYBERWITCH_ACCENTS[id].text, CYBERWITCH_SURFACE.canvas), id).toBeGreaterThanOrEqual(4.5)
  })
  it('writes each preset as a data-accent block that rewrites only the ramps', () => {
    for (const id of Object.keys(CYBERWITCH_ACCENTS)) expect(CYBERWITCH_ACCENT_CSS).toContain(`[data-accent="${id}"]{--cw-flare-300:`)
  })
  it('measures an owner accent: a preset keeps its own ramp, any other hex is lifted for text and gets a readable label', () => {
    expect(cyberwitchAccentVars(null)['--color-primary']).toBe('#FF00FF')
    expect(cyberwitchAccentVars('#1ff4ff')['--color-primary-strong']).toBe('#5CFFFF')
    const custom = cyberwitchAccentVars('#2244aa')
    expect(custom['--color-primary']).toBe('#2244aa')
    expect(custom['--color-text-on-primary']).toBe('#FFFFFF')
    expect(cyberwitchAccentVars('not a colour')['--color-primary']).toBe('#FF00FF')
  })
})

describe('one neon on the starter site pictures', () => {
  it('names the preset a colour is, any case, and nothing for another colour', () => {
    expect(cyberwitchAccentId('#b4ff1a')).toBe('absinthe')
    expect(cyberwitchAccentId('#FF00FF')).toBe('hex')
    expect(cyberwitchAccentId('#123456')).toBeNull()
    expect(cyberwitchAccentId(null)).toBeNull()
  })
  it('re-points every wall and founder shot to the neon and leaves the rest', () => {
    const snap = { pages: [{ blocks: [{ props: { image: '/sites/cyberwitch/photos/hero-hex.jpg', portrait: '/sites/cyberwitch/photos/founder-ice.jpg', story: '/sites/cyberwitch/photos/story.jpg' } }] }] }
    expect(withCyberWitchAccentPhotos(snap, 'absinthe')).toEqual({ pages: [{ blocks: [{ props: { image: '/sites/cyberwitch/photos/hero-absinthe.jpg', portrait: '/sites/cyberwitch/photos/founder-absinthe.jpg', story: '/sites/cyberwitch/photos/story.jpg' } }] }] })
  })
})
