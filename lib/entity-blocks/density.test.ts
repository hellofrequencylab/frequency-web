import { describe, expect, it } from 'vitest'
import { DENSITY_STACK, stackClassFor } from './density'

describe('density scale', () => {
  it('keeps the two spacings that shipped before the scale existed', () => {
    expect(stackClassFor('roomy')).toBe('space-y-14')
    expect(stackClassFor('compact')).toBe('space-y-6')
  })

  it('has exactly three steps, each a different spacing', () => {
    expect(Object.keys(DENSITY_STACK).sort()).toEqual(['compact', 'roomy', 'standard'])
    expect(new Set(Object.values(DENSITY_STACK)).size).toBe(3)
  })
})
