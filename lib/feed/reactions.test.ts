import { describe, it, expect } from 'vitest'
import { REACTIONS, REACTION_KEYS, isReactionKey, reactionLabel } from './reactions'

describe('reaction allowed set', () => {
  it('exposes six curated emojis', () => {
    expect(REACTIONS).toHaveLength(6)
    expect(REACTION_KEYS).toEqual(['❤️', '🔥', '🙌', '😂', '😮', '🙏'])
  })

  it('every reaction has a non-empty human label', () => {
    for (const r of REACTIONS) {
      expect(r.label.length).toBeGreaterThan(0)
    }
  })

  it('keys are unique', () => {
    expect(new Set(REACTION_KEYS).size).toBe(REACTION_KEYS.length)
  })
})

describe('isReactionKey', () => {
  it('accepts every emoji in the set', () => {
    for (const key of REACTION_KEYS) {
      expect(isReactionKey(key)).toBe(true)
    }
  })

  it('rejects the retired legacy keys', () => {
    expect(isReactionKey('heart')).toBe(false)
    expect(isReactionKey('plus_one')).toBe(false)
  })

  it('rejects arbitrary / injected values', () => {
    expect(isReactionKey('')).toBe(false)
    expect(isReactionKey('💀')).toBe(false)
    expect(isReactionKey('<script>')).toBe(false)
    expect(isReactionKey('❤️❤️')).toBe(false)
  })
})

describe('reactionLabel', () => {
  it('returns the human label for a known emoji', () => {
    expect(reactionLabel('❤️')).toBe('Love this')
    expect(reactionLabel('🙏')).toBe('Grateful')
  })

  it('falls back to the value itself for an unknown emoji', () => {
    expect(reactionLabel('💀')).toBe('💀')
  })
})
