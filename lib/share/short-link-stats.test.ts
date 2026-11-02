import { describe, expect, it } from 'vitest'
import { opensLabel } from './short-link-stats'

describe('opensLabel', () => {
  it('reads counts in words', () => {
    expect(opensLabel(null)).toBeNull()
    expect(opensLabel(0)).toBe('No opens yet')
    expect(opensLabel(1)).toBe('1 open in the last 30 days')
    expect(opensLabel(12)).toBe('12 opens in the last 30 days')
  })
})
