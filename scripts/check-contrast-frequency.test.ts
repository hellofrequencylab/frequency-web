import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { evaluateContrast, PAIRS } from './check-contrast.mjs'
import {
  FREQUENCY_SHEETS,
  FREQUENCY_STATES,
  frequencyWeight,
  parseSelector,
  resolveFrequencyTokens,
  unsupportedSelectors,
} from './lib/contrast-frequency.mjs'

// SCAN-1115: the contrast gate used to read app/globals.css alone, so Frequency (Commons and Stage)
// had no gate. These pin the resolver that reads the Frequency sheets the way the browser does.

const root = { root: true, classes: [] as string[], attrs: { 'data-design': 'frequency' } }
const dark = { ...root, classes: ['dark'] }
const stage = { classes: [] as string[], attrs: { 'data-surface': 'stage' } }

describe('frequency contrast resolver', () => {
  it('scores a compound with the root, a class and an attribute', () => {
    expect(frequencyWeight('.dark[data-design="frequency"]', [dark], 0)).toBe(20)
    expect(frequencyWeight('.dark[data-design="frequency"]', [root], 0)).toBeNull()
  })

  it('matches a descendant stage surface and not an unmarked element', () => {
    const sel = ':root[data-design="frequency"] [data-surface="stage"]'
    expect(frequencyWeight(sel, [root, stage], 1)).toBe(30)
    expect(frequencyWeight(sel, [root, { classes: [], attrs: {} }], 1)).toBeNull()
  })

  it('honours :not() and takes the strongest part of a list', () => {
    const sel = ':root[data-design="frequency"]:not(.dark), .dark[data-design="frequency"]'
    expect(frequencyWeight(sel, [root], 0)).toBe(30)
    expect(frequencyWeight(sel, [dark], 0)).toBe(20)
  })

  it('refuses a selector shape it cannot score instead of guessing', () => {
    expect(parseSelector('.a > .b')).toBeNull()
  })

  it('reads every selector in the Frequency sheets', () => {
    const [, ...frequency] = FREQUENCY_SHEETS.map((f) => readFileSync(f, 'utf8'))
    expect(unsupportedSelectors(frequency)).toEqual([])
  })

  it('declares a var() against the element that declares it, not the root', () => {
    const css = `
      :root[data-design="frequency"] { --fq-a: #000000; --color-x: var(--fq-a); }
      [data-surface="stage"] { --fq-a: #FFFFFF; }
    `
    const day = { key: 'x', chain: [root] }
    const onStage = { key: 'y', chain: [root, stage] }
    expect(resolveFrequencyTokens([css], day).get('--color-x')).toBe('#000000')
    // --color-x was computed on the root, so Stage inherits black. This is why Stage redeclares
    // its aliases on itself, and why the resolver must not re-substitute at the child.
    expect(resolveFrequencyTokens([css], onStage).get('--color-x')).toBe('#000000')
  })

  it('folds an oklab color-mix to a literal', () => {
    const css = `:root[data-design="frequency"] { --color-x: color-mix(in oklab, #000000 50%, #FFFFFF); }`
    const v = resolveFrequencyTokens([css], { key: 'x', chain: [root] }).get('--color-x') ?? ''
    expect(v.startsWith('rgba(')).toBe(true)
    // Browsers render oklab black/white 50% as rgb(99, 99, 99), darker than the sRGB midpoint.
    expect(Math.round(Number(v.slice(5).split(',')[0]))).toBe(99)
  })

  it('resolves every pair of the real sheets in every Frequency state', () => {
    const sheets = FREQUENCY_SHEETS.map((f) => readFileSync(f, 'utf8'))
    const rows = evaluateContrast(sheets as unknown as string, { states: FREQUENCY_STATES, resolve: resolveFrequencyTokens })
    expect(rows.filter((r) => r.unresolved)).toEqual([])
    expect(rows.filter((r) => !r.pass)).toEqual([])
    expect(new Set(rows.map((r) => r.state))).toEqual(new Set(FREQUENCY_STATES.map((s) => s.key)))
    expect(rows.length).toBeGreaterThan(PAIRS.length * 3 - 40)
  })
})
