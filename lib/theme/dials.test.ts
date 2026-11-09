import { describe, expect, it } from 'vitest'
import { SITE_DIAL_OPTIONS, dialsFor, hasNewDials, isDialAccent, looksFor, matchLook, type ThemeEditorDecl } from './dials'
import REGISTRY from './dials.json'

// LIVE-1997: the registry is the one list of controls; a theme's manifest only says which it varies on.
const ALL = Object.fromEntries(['accent', 'register', 'corners', 'spacing', 'type', 'motion', 'hero', 'header', 'footer', 'image'].map((id) => [id, 'supported'])) as ThemeEditorDecl['dials']

describe('the dial registry', () => {
  it('holds the thirteen dials of the handoff, with no duplicate id', () => {
    const ids = REGISTRY.dials.map((d) => d.id)
    expect(ids).toHaveLength(13)
    expect(new Set(ids).size).toBe(13)
  })
  it('offers the registry options for each new dial', () => {
    expect(SITE_DIAL_OPTIONS.register.map((o) => o.id)).toEqual(['night', 'day'])
    expect(SITE_DIAL_OPTIONS.type.map((o) => o.id)).toEqual(['caps', 'quiet', 'editorial'])
    expect(SITE_DIAL_OPTIONS.motion.map((o) => o.id)).toEqual(['full', 'calm', 'off'])
    expect(SITE_DIAL_OPTIONS.hero.map((o) => o.id)).toEqual(['glow', 'photo', 'split', 'minimal'])
    expect(SITE_DIAL_OPTIONS.image.map((o) => o.id)).toEqual(['glow', 'grain', 'mono', 'clean'])
  })
  it('accepts a theme swatch id or a #rrggbb accent and nothing else', () => {
    for (const ok of ['tide', 'my-accent', '#1AA7C0']) expect(isDialAccent(ok), ok).toBe(true)
    for (const bad of ['', '#fff', 'red green', 'Tide', 4, null]) expect(isDialAccent(bad), String(bad)).toBe(false)
  })
})

describe('what a theme shows', () => {
  it('shows a schema 1 theme exactly the four dials it always had', () => {
    const d = dialsFor(null)
    expect(d.map((x) => x.id)).toEqual(['corners', 'spacing', 'header', 'footer'])
    expect(hasNewDials(d)).toBe(false)
    expect(d.find((x) => x.id === 'header')!.options.map((o) => o.id)).toEqual(['bar', 'pill', 'centered'])
  })
  it('hides a fixed dial instead of drawing a one-option control', () => {
    const d = dialsFor({ dials: { ...ALL, hero: 'fixed', motion: { supported: false } } })
    expect(d.some((x) => x.id === 'hero' || x.id === 'motion')).toBe(false)
    expect(hasNewDials(d)).toBe(true)
  })
  it('draws a theme-added dial in Advanced under the theme name', () => {
    const d = dialsFor({ dials: ALL, themeDials: [{ id: 'arch', label: 'Arch shape', group: 'Shape', options: [['round', 'Round'], ['pointed', 'Pointed']] }] }, 'Temple')
    expect(d.at(-1)).toMatchObject({ id: 'arch', tier: 'theme', fromTheme: 'Temple' })
  })
  it('offers the centered header now that the house header draws it (LIVE-2031)', () => {
    expect(dialsFor({ dials: ALL }).find((x) => x.id === 'header')!.options.map((o) => o.id)).toContain('centered')
  })
})

describe('looks', () => {
  const decl: ThemeEditorDecl = { dials: ALL, looks: [{ id: 'paper', label: 'Paper', dials: { register: 'day', type: 'editorial', nope: 'x', hero: 'bogus' } }, { id: 'nightline', label: 'Nightline', dials: { register: 'night' } }] }
  const dials = dialsFor(decl)
  it('puts the theme\'s own first and drops unknown dials and values', () => {
    const l = looksFor(decl, dials)
    expect(l.map((x) => x.id)).toEqual(['own', 'paper', 'nightline'])
    expect(l[1].dials).toEqual({ register: 'day', type: 'editorial' })
  })
  it('ships none when a theme declares none', () => expect(looksFor({ dials: ALL }, dials)).toEqual([]))
  it('names the matching look, or edited', () => {
    const l = looksFor(decl, dials)
    const own = { register: 'night', type: 'caps' }
    expect(matchLook(l, { register: 'night', type: 'caps' }, own)).toBe('own')
    expect(matchLook(l, { register: 'day', type: 'editorial' }, own)).toBe('paper')
    expect(matchLook(l, { register: 'day', type: 'caps' }, own)).toBe('edited')
    expect(matchLook([], own, own)).toBeNull()
  })
})
