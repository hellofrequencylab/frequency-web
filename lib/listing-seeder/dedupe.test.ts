import { describe, it, expect } from 'vitest'

import { titleSimilarity, titleTokens } from './dedupe'

describe('titleTokens', () => {
  it('lowercases, strips punctuation, and dedupes', () => {
    expect([...titleTokens('Cozy, Cozy 2-Bed Apartment!')]).toEqual(['cozy', '2', 'bed', 'apartment'])
  })

  it('is empty for a blank title', () => {
    expect(titleTokens('   ').size).toBe(0)
  })
})

describe('titleSimilarity', () => {
  it('is 1 for identical titles (ignoring case and punctuation)', () => {
    expect(titleSimilarity('Sunny Studio Downtown', 'sunny studio downtown!')).toBe(1)
  })

  it('is above the 0.6 threshold for near-duplicate titles', () => {
    // tokens {sunny, studio, in, downtown} vs {sunny, studio, downtown} -> 3 shared / 4 union = 0.75
    expect(titleSimilarity('Sunny studio in downtown', 'Sunny studio downtown')).toBeGreaterThanOrEqual(0.6)
  })

  it('is below the threshold for unrelated titles', () => {
    expect(titleSimilarity('Road bike for sale', '3 bedroom house for rent')).toBeLessThan(0.6)
  })

  it('is 0 when either title is empty', () => {
    expect(titleSimilarity('', 'anything at all')).toBe(0)
    expect(titleSimilarity('anything at all', '')).toBe(0)
  })

  it('is symmetric', () => {
    const a = 'Vintage oak dining table'
    const b = 'Oak dining table vintage set'
    expect(titleSimilarity(a, b)).toBe(titleSimilarity(b, a))
  })
})
