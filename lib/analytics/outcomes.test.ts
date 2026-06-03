import { describe, it, expect } from 'vitest'
import { completionRate, fillRate } from './outcomes'

describe('completionRate', () => {
  it('rounds completed/started to a percent', () => {
    expect(completionRate(4, 1)).toBe(25)
    expect(completionRate(3, 3)).toBe(100)
    expect(completionRate(8, 1)).toBe(13)
  })
  it('is null when nothing started (no divide-by-zero)', () => {
    expect(completionRate(0, 0)).toBeNull()
  })
})

describe('fillRate', () => {
  it('is count/cap as a percent', () => {
    expect(fillRate(6, 12)).toBe(50)
    expect(fillRate(12, 12)).toBe(100)
  })
  it('is null when uncapped', () => {
    expect(fillRate(5, null)).toBeNull()
    expect(fillRate(5, 0)).toBeNull()
  })
})
