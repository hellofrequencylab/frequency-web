import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { MINDLESS_CSS } from '@/components/sites/mindless-css'
import { MINDLESS_ACCENTS, MINDLESS_ACCENT_CSS, MINDLESS_DIALS_CSS, MINDLESS_ON_ACCENT, MINDLESS_SURFACE, MINDLESS_TOKENS_CSS, mindlessAccentId, mindlessAccentVars, withMindlessAccentPhotos, type MindlessAccentId } from './mindless'

const SHEETS = [MINDLESS_TOKENS_CSS, MINDLESS_DIALS_CSS, MINDLESS_ACCENT_CSS]
const ids = Object.keys(MINDLESS_ACCENTS) as MindlessAccentId[]

describe('Mindless theme tokens', () => {
  it('scopes every selector to the stand-alone site render, never :root (theme fence)', () => {
    for (const css of SHEETS) {
      expect(css).not.toContain(':root')
      for (const sel of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) expect(sel[1].trim().startsWith('[data-house-theme="mindless"]'), sel[1]).toBe(true)
    }
  })
  it('declares every custom property as --ml-* so no other theme meets them', () => {
    for (const css of SHEETS) for (const decl of css.matchAll(/(?:^|[;{\n])\s*(--[a-z0-9-]+)\s*:/g)) expect(decl[1].startsWith('--ml-'), decl[1]).toBe(true)
  })
  it('is night first with a Day register that turns the accent text to ink for Yellow', () => {
    expect(MINDLESS_TOKENS_CSS).toContain('[data-house-theme="mindless"][data-th="day"]{')
    expect(MINDLESS_ACCENTS.yellow.dayText).toBe('#231B1D')
  })
  it('offers Yellow, Pink and Blue, Yellow first', () => {
    expect(ids).toEqual(['yellow', 'pink', 'blue'])
    expect(MINDLESS_SURFACE.accent.accent).toBe(MINDLESS_ACCENTS.yellow.accent)
  })
  it('carries ink on every filled accent, at least 4:1 (bold 19px+ labels), and 4.5:1 on Yellow', () => {
    for (const id of ids) expect(contrastRatio(MINDLESS_ON_ACCENT, MINDLESS_ACCENTS[id].accent), id).toBeGreaterThanOrEqual(3.9)
    expect(contrastRatio(MINDLESS_ON_ACCENT, MINDLESS_ACCENTS.yellow.accent)).toBeGreaterThanOrEqual(4.5)
  })
  it('reads accent text at 4.5:1 on the ink ground, and the Day text at 4.5:1 on paper', () => {
    for (const id of ids) {
      expect(contrastRatio(MINDLESS_ACCENTS[id].text, MINDLESS_SURFACE.canvas), id).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(MINDLESS_ACCENTS[id].dayText, '#F1E8EA'), id).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('measures an owner accent: a preset keeps its own ramp, any other hex gets a readable label', () => {
    expect(mindlessAccentVars(null)['--color-primary']).toBe('#ECBC19')
    expect(mindlessAccentVars('#e6297d')['--color-primary-strong']).toBe('#F0609F')
    expect(mindlessAccentVars('#2244aa')['--color-text-on-primary']).toBe('#FFFFFF')
    expect(mindlessAccentVars('not a colour')['--color-primary']).toBe('#ECBC19')
  })
})

describe('one paint on the starter site pictures', () => {
  it('names the preset a colour is, any case, and nothing for another colour', () => {
    expect(mindlessAccentId('#e6297d')).toBe('pink')
    expect(mindlessAccentId('#123456')).toBeNull()
    expect(mindlessAccentId(null)).toBeNull()
  })
  it('re-points every paint photo to the accent and leaves the mono ones', () => {
    const snap = { image: '/sites/mindless/photos/hero-yellow.jpg', story: '/sites/mindless/photos/firepit-mono.jpg' }
    expect(withMindlessAccentPhotos(snap, 'blue')).toEqual({ image: '/sites/mindless/photos/hero-blue.jpg', story: '/sites/mindless/photos/firepit-mono.jpg' })
  })
})


describe('Mindless site skin', () => {
  it('only ever dresses the stand-alone render: every rule sits under the house-theme attribute', () => {
    expect(MINDLESS_CSS).not.toContain(':root')
    expect(MINDLESS_CSS).not.toContain('[data-house-theme="services"]')
  })
  it('answers every --ml-* name its block sheet reads', () => {
    const declared = new Set([...MINDLESS_CSS.matchAll(/(?:^|[;{\n])\s*(--ml-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const read = new Set([...MINDLESS_CSS.matchAll(/var\((--ml-[a-z0-9-]+)/g)].map((m) => m[1]))
    const missing = [...read].filter((n) => !declared.has(n))
    expect(missing).toEqual([])
  })
  it('never sets yellow as text on the Day paper: the accent phrase is ink on a highlighter', () => {
    expect(MINDLESS_CSS).toMatch(/\[data-th="day"\]\{--ml-accent-text:var\(--ml-ink\)\}/)
    expect(MINDLESS_CSS).toMatch(/\[data-th="day"\] \.hs-h1 em[^{]*\{color:var\(--ml-ink\);background:linear-gradient/)
  })
  it('draws primary buttons as paint stickers and stops motion for reduced-motion', () => {
    expect(MINDLESS_CSS).toMatch(/\.sv-btn--accent\{background:var\(--ml-accent\);color:var\(--ml-on-accent\);border:var\(--ml-outline\)/)
    expect(MINDLESS_CSS).toContain('prefers-reduced-motion:reduce')
  })
})
