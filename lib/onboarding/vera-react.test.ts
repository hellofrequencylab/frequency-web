import { describe, it, expect } from 'vitest'
import { veraIntentReaction, veraCityNote } from './vera-react'

describe('veraIntentReaction', () => {
  it('returns null for empty intent', () => {
    expect(veraIntentReaction('')).toBeNull()
    expect(veraIntentReaction('   ')).toBeNull()
  })

  it('keys off "new in town"', () => {
    expect(veraIntentReaction('I just moved here')).toContain('New here')
  })

  it('keys off wanting people/community', () => {
    expect(veraIntentReaction('want to meet new friends')).toContain('lasted')
  })

  it('keys off a playful hobby', () => {
    expect(veraIntentReaction('a decent slice of pizza')).toContain('die on that hill')
  })

  it('reflects the words back by default', () => {
    const r = veraIntentReaction('a quiet place to think')
    expect(r).toContain('a quiet place to think')
  })

  it('has no em dashes (house style)', () => {
    for (const s of ['I just moved here', 'meet people', 'pizza', 'something else entirely']) {
      expect(veraIntentReaction(s)).not.toContain('—')
    }
  })
})

describe('veraCityNote', () => {
  it('uses the first segment of the city label', () => {
    expect(veraCityNote('Carlsbad, California, United States')).toContain('Carlsbad.')
  })
  it('returns null for empty', () => {
    expect(veraCityNote('')).toBeNull()
  })
})
