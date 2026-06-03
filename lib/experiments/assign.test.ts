import { describe, it, expect } from 'vitest'
import { hashToUnit, assignVariant, getVariant } from './assign'
import type { Variant } from './registry'

describe('hashToUnit', () => {
  it('is deterministic and within [0, 1)', () => {
    const a = hashToUnit('experiment:user-1')
    expect(a).toBe(hashToUnit('experiment:user-1'))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })
  it('differs across seeds', () => {
    expect(hashToUnit('a')).not.toBe(hashToUnit('b'))
  })
})

describe('assignVariant', () => {
  const ab: Variant[] = [{ key: 'control', weight: 1 }, { key: 'treatment', weight: 1 }]

  it('is stable for the same seed', () => {
    const v = assignVariant(ab, 'exp:user-42')
    expect(assignVariant(ab, 'exp:user-42')).toBe(v)
  })

  it('roughly honors weights over many units', () => {
    const weighted: Variant[] = [{ key: 'control', weight: 9 }, { key: 'treatment', weight: 1 }]
    let treatment = 0
    const N = 4000
    for (let i = 0; i < N; i++) if (assignVariant(weighted, `exp:u${i}`) === 'treatment') treatment++
    const share = treatment / N
    expect(share).toBeGreaterThan(0.05)
    expect(share).toBeLessThan(0.15) // ~10%
  })

  it('falls back to control on empty/zero weights', () => {
    expect(assignVariant([], 'x')).toBe('control')
    expect(assignVariant([{ key: 'control', weight: 0 }, { key: 't', weight: 0 }], 'x')).toBe('control')
  })
})

describe('getVariant', () => {
  it('returns control (holdout) for unknown or off experiments', () => {
    expect(getVariant('does_not_exist', 'u1')).toBe('control')
    expect(getVariant('onboarding_first_action', 'u1')).toBe('control') // registered but status: off
  })
})
