import { describe, it, expect } from 'vitest'
import { computeFunnel } from './dashboard'

describe('computeFunnel', () => {
  it('first step has no drop; later steps measure loss vs the previous', () => {
    const out = computeFunnel([
      { step: 'a', eventType: 'a', actors: 100 },
      { step: 'b', eventType: 'b', actors: 40 },
      { step: 'c', eventType: 'c', actors: 10 },
    ])
    expect(out[0].dropPct).toBeNull()
    expect(out[1].dropPct).toBe(60)
    expect(out[2].dropPct).toBe(75)
  })

  it('null drop when the previous step is zero (avoids divide-by-zero)', () => {
    const out = computeFunnel([
      { step: 'a', eventType: 'a', actors: 0 },
      { step: 'b', eventType: 'b', actors: 0 },
    ])
    expect(out[1].dropPct).toBeNull()
  })
})
