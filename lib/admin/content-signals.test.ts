import { describe, it, expect } from 'vitest'
import { journeyScore, completionRate } from './content-signals'

// The ranking math is pure; these lock the weighting contract the admin
// content suite and Vera's creator tips both rank by.

describe('journeyScore', () => {
  it('weights adoption over forks over active adoptions (3/2/1)', () => {
    expect(journeyScore({ adopt_count: 1, forked_count: 0, active_adoptions: 0 })).toBe(3)
    expect(journeyScore({ adopt_count: 0, forked_count: 1, active_adoptions: 0 })).toBe(2)
    expect(journeyScore({ adopt_count: 0, forked_count: 0, active_adoptions: 1 })).toBe(1)
  })

  it('sums the components', () => {
    expect(journeyScore({ adopt_count: 4, forked_count: 2, active_adoptions: 3 })).toBe(19)
  })

  it('is zero with no signal', () => {
    expect(journeyScore({ adopt_count: 0, forked_count: 0, active_adoptions: 0 })).toBe(0)
  })

  it('ranks a heavily adopted journey above a heavily forked one', () => {
    const adopted = journeyScore({ adopt_count: 10, forked_count: 0, active_adoptions: 0 })
    const forked = journeyScore({ adopt_count: 0, forked_count: 10, active_adoptions: 0 })
    expect(adopted).toBeGreaterThan(forked)
  })
})

describe('completionRate', () => {
  it('rounds to a whole percent', () => {
    expect(completionRate(1, 3)).toBe(33)
    expect(completionRate(2, 3)).toBe(67)
  })

  it('handles full and zero completion', () => {
    expect(completionRate(5, 5)).toBe(100)
    expect(completionRate(0, 5)).toBe(0)
  })

  it('is safe with zero starters', () => {
    expect(completionRate(0, 0)).toBe(0)
    expect(completionRate(3, 0)).toBe(0)
  })
})
