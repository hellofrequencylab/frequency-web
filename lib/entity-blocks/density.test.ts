import { describe, expect, it } from 'vitest'
import { stackClassFor } from './density'
import type { BlockDensity } from './define-block'

describe('density scale', () => {
  it('keeps the two spacings that shipped before the scale existed', () => {
    expect(stackClassFor('roomy')).toBe('space-y-14')
    expect(stackClassFor('compact')).toBe('space-y-6')
  })

  it('has exactly three steps, each a different spacing', () => {
    const steps: BlockDensity[] = ['compact', 'standard', 'roomy']
    expect(new Set(steps.map(stackClassFor)).size).toBe(3)
  })
})
