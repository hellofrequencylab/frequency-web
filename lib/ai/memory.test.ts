import { describe, it, expect } from 'vitest'
import { mergeFacts } from './memory'

describe('mergeFacts', () => {
  it('unions list fields, de-duping case-insensitively (first casing wins)', () => {
    const out = mergeFacts({ interests: ['Hiking'] }, { interests: ['hiking', 'Climbing'] })
    expect(out.interests).toEqual(['Hiking', 'Climbing'])
  })

  it('trims and drops empties', () => {
    const out = mergeFacts({}, { goals: ['  get outside  ', '', '   '] })
    expect(out.goals).toEqual(['get outside'])
  })

  it('overwrites neighborhood only when provided', () => {
    expect(mergeFacts({ neighborhood: 'Encinitas' }, {}).neighborhood).toBe('Encinitas')
    expect(mergeFacts({ neighborhood: 'Encinitas' }, { neighborhood: 'Leucadia' }).neighborhood).toBe('Leucadia')
    expect(mergeFacts({ neighborhood: 'Encinitas' }, { neighborhood: null }).neighborhood).toBeNull()
  })

  it('leaves untouched fields alone', () => {
    const out = mergeFacts({ interests: ['a'], goals: ['g'] }, { interests: ['b'] })
    expect(out.goals).toEqual(['g'])
    expect(out.interests).toEqual(['a', 'b'])
  })

  it('caps a list at 25 entries', () => {
    const many = Array.from({ length: 40 }, (_, i) => `i${i}`)
    expect(mergeFacts({}, { interests: many }).interests).toHaveLength(25)
  })
})
