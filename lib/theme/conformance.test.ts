import { describe, expect, it } from 'vitest'
import CONTRACT from '@/lib/sites/editor/theme-contract.json'
import { INVARIANTS, conformanceMatrix, contrast, emptyStates, heightStability, hiddenFunctions, literalColours, motionAdditive, reducedMotion, repaintBudget, resetTotal, surfaceParity } from './conformance'

// LIVE-1998: each invariant has a passing case, a failing case, and the failure names what broke.
const ok = { bg: '#0B0F13', text: '#F5F6F7', display: '#FFFFFF', accent: '#1AA7C0', accentText: '#3FC1D6', onAccent: '#0B0F13' }

describe('the ten invariants', () => {
  it('names exactly ten', () => expect(INVARIANTS).toHaveLength(10))

  it('1 contrast: passes a healthy register, names each pair that fails', () => {
    expect(contrast(ok)).toEqual([])
    expect(contrast({ ...ok, text: '#555B61' }, 'night/tide')).toEqual([expect.stringContaining('text on ground')])
    expect(contrast({ ...ok, onAccent: '#FFFFFF' })[0]).toContain('button label on accent')
    expect(contrast({ ...ok, accent: 'teal' })[0]).toContain('not a #rrggbb')
  })
  it('1 contrast: holds for a real contract (Nocturne)', () => {
    const m = (CONTRACT as unknown as { themes: Record<string, Record<string, string>> }).themes.Midnight
    expect(contrast({ bg: m['--th-bg'], text: m['--th-text'], accent: m['--th-accent'], accentText: m['--th-accent-text'], onAccent: m['--th-on-accent'] })).toEqual([])
  })

  it('2 no literal colours: flags hex, rgb and hsl with their line', () => {
    expect(literalColours('const a = 1\nconst c = "var(--th-accent)"')).toEqual([])
    expect(literalColours('x\nstyle={{ color: "#1AA7C0" }}\nbackground: rgba(0,0,0,.4)', 'hero.tsx')).toEqual(['hero.tsx:2 names a colour (#1AA7C0)', 'hero.tsx:3 names a colour (rgba()'])
  })

  it('3 height stability: allows 8% drift, names the block beyond it', () => {
    expect(heightStability({ hero: { caps: 600, quiet: 640, editorial: 620 } })).toEqual([])
    expect(heightStability({ hero: { caps: 600, quiet: 660 } }, '390')).toEqual(['hero moves 10.0% between type voices (390)'])
  })

  it('4 motion is additive: only effect layers may differ', () => {
    const base = [{ id: 'h1', x: 0, y: 0, w: 100, h: 40 }, { id: 'glow', x: 0, y: 0, w: 9, h: 9, effect: true }]
    expect(motionAdditive(base, [base[0]])).toEqual([])
    expect(motionAdditive(base, [{ ...base[0], y: 12 }])).toEqual(['h1 moves or resizes with motion off'])
    expect(motionAdditive(base, [])).toEqual(['h1 disappears with motion off'])
  })
  it('5 reduced motion wins', () => {
    expect(reducedMotion([{ id: 'glow', animating: false }])).toEqual([])
    expect(reducedMotion([{ id: 'glow', animating: true }])).toEqual(['glow still animates under reduced motion'])
  })

  it('6 empty states: a placeholder for images, a line for lists', () => {
    expect(emptyStates([{ id: 'hero-photo', kind: 'image', empty: 'placeholder' }, { id: 'events', kind: 'list', empty: 'line' }])).toEqual([])
    expect(emptyStates([{ id: 'gallery', kind: 'image', empty: 'blank' }, { id: 'shop', kind: 'list', empty: 'nothing' }])).toHaveLength(2)
  })

  it('7 hidden functions leave nothing behind', () => {
    expect(hiddenFunctions('<section data-fn="shop"></section>', 'events')).toEqual([])
    expect(hiddenFunctions('<section data-fn="events"></section>', 'events')).toEqual(['events is off but still in the page'])
  })

  it('8 reset is total', () => {
    expect(resetTotal({ '--th-bg': 'a', 'data-motion': 'full' }, { '--th-bg': 'a', 'data-motion': 'full' })).toEqual([])
    expect(resetTotal({ 'data-motion': 'full' }, { 'data-motion': 'calm', 'data-hero': 'split' })).toHaveLength(2)
  })

  it('9 surface parity: one fixture, the same rows everywhere; a declared null is not a gap', () => {
    expect(surfaceParity({ website: ['Cut', '$40'], spotlight: ['$40', 'Cut'], email: null }, 'services')).toEqual([])
    expect(surfaceParity({ website: ['Cut', '$40'], email: ['Cut', '$45'] }, 'services')).toEqual(['services: email shows different rows than website'])
  })

  it('10 repaint budget: under 100ms and no reload', () => {
    expect(repaintBudget(42)).toEqual([])
    expect(repaintBudget(140, true, 'accent')).toEqual(['a dial change reloaded the page (accent)', 'repaint took 140ms, budget is 100ms (accent)'])
  })
})

describe('the matrix', () => {
  it('covers every register, accent, type voice, hero and header at both widths', () => {
    const m = conformanceMatrix(['tide', 'bloom'], ['bar', 'pill', 'centered'])
    expect(new Set(m.map((c) => c.register))).toEqual(new Set(['night', 'day']))
    expect(new Set(m.map((c) => c.hero))).toEqual(new Set(['glow', 'photo', 'split', 'minimal']))
    expect(new Set(m.map((c) => c.header))).toEqual(new Set(['bar', 'pill', 'centered']))
    expect(new Set(m.map((c) => c.width))).toEqual(new Set([1440, 390]))
    expect(m).toHaveLength(2 * 2 * 3 * 4 * 2)
  })
})
