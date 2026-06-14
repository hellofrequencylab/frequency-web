import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  GENERATIONS,
  DEFAULT_GENERATION,
  isGenerationId,
  resolveGeneration,
} from './generations'

describe('generation registry (docs/SPACES.md adaptive theming)', () => {
  it('registers the default and it is balanced', () => {
    expect(GENERATIONS.some((g) => g.id === DEFAULT_GENERATION)).toBe(true)
    expect(DEFAULT_GENERATION).toBe('balanced')
  })

  it('has unique generation ids', () => {
    const ids = GENERATIONS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders the adult spectrum then the kids spectrum (contiguous 0..n-1)', () => {
    const sorted = [...GENERATIONS].sort((a, b) => a.order - b.order)
    expect(sorted.map((g) => g.id)).toEqual([
      'spacious',
      'classic',
      'balanced',
      'bold',
      'playful',
      'kids-early',
      'kids-mid',
      'kids-tween',
    ])
    // orders are unique + contiguous from 0
    expect(sorted.map((g) => g.order)).toEqual(GENERATIONS.map((_, i) => i))
  })

  it('groups + contrast floors are well-formed (AAA for the calm ends and all kids)', () => {
    for (const g of GENERATIONS) {
      expect(g.group === 'adult' || g.group === 'kids').toBe(true)
      expect(g.minContrast === 'AA' || g.minContrast === 'AAA').toBe(true)
      if (g.group === 'kids') expect(g.minContrast).toBe('AAA')
    }
    // the dense adult middle is AA; the calm adult ends are AAA
    const byId = Object.fromEntries(GENERATIONS.map((g) => [g.id, g]))
    expect(byId['spacious'].minContrast).toBe('AAA')
    expect(byId['classic'].minContrast).toBe('AAA')
    expect(byId['balanced'].minContrast).toBe('AA')
    expect(byId['bold'].minContrast).toBe('AA')
    expect(byId['playful'].minContrast).toBe('AA')
  })

  it('resolveGeneration / isGenerationId pass known ids through and fall back otherwise', () => {
    for (const g of GENERATIONS) {
      expect(isGenerationId(g.id)).toBe(true)
      expect(resolveGeneration(g.id)).toBe(g.id)
    }
    expect(isGenerationId('does-not-exist')).toBe(false)
    expect(resolveGeneration('does-not-exist')).toBe(DEFAULT_GENERATION)
    expect(resolveGeneration(null)).toBe(DEFAULT_GENERATION)
    expect(resolveGeneration(undefined)).toBe(DEFAULT_GENERATION)
  })
})

// The CSS ⇄ registry CONTRACT. Every GenerationId MUST have a `[data-generation="<id>"]`
// block authored in app/globals.css. A generation added to the registry without its CSS
// (or vice-versa) fails the suite, so the two can never quietly drift apart.
describe('generation CSS contract (every id has its [data-generation] block)', () => {
  const globalsCss = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  )

  for (const gen of GENERATIONS) {
    it(`generation: ${gen.id} has a [data-generation] block`, () => {
      const re = new RegExp(`\\[data-generation="${gen.id}"\\]\\s*\\{`)
      expect(globalsCss).toMatch(re)
    })
  }
})
