import { describe, it, expect } from 'vitest'
import {
  SEED_MOODS,
  DEFAULT_SEED_MOOD,
  isSeedMood,
  normalizeSeedMood,
  seedMoodSpec,
  moodToneDirective,
} from './moods'

describe('seed moods', () => {
  it('has exactly the four owner-picked moods, each fully specified', () => {
    expect(SEED_MOODS.map((m) => m.key)).toEqual(['warm', 'bold', 'calm', 'playful'])
    for (const m of SEED_MOODS) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.toneWords.length).toBeGreaterThan(0)
      expect(['gentle', 'direct', 'confident']).toContain(m.cta)
      expect(['soft', 'vivid', 'minimal', 'high']).toContain(m.accent)
      // Voice canon: operator copy carries no em dashes.
      expect(m.description).not.toContain('—')
    }
  })

  it('isSeedMood only accepts known keys', () => {
    expect(isSeedMood('warm')).toBe(true)
    expect(isSeedMood('nope')).toBe(false)
    expect(isSeedMood(undefined)).toBe(false)
  })

  it('normalizeSeedMood is total and falls back to the default', () => {
    expect(normalizeSeedMood('bold')).toBe('bold')
    expect(normalizeSeedMood('garbage')).toBe(DEFAULT_SEED_MOOD)
    expect(normalizeSeedMood(null)).toBe(DEFAULT_SEED_MOOD)
  })

  it('seedMoodSpec never returns undefined', () => {
    expect(seedMoodSpec('calm').key).toBe('calm')
    expect(seedMoodSpec('garbage').key).toBe(DEFAULT_SEED_MOOD)
  })

  it('moodToneDirective names the mood + its tone words', () => {
    const d = moodToneDirective('playful')
    expect(d).toContain('Playful and vibrant')
    expect(d).toContain('vibrant')
  })
})
