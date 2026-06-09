import { describe, it, expect } from 'vitest'
import { resolveTier, isIntensityTier, DEFAULT_TIER, INTENSITY_TIERS } from '@/lib/journey-tiers'

describe('resolveTier', () => {
  it('member override wins over circle and item', () => {
    expect(resolveTier('deep', 'spark', 'current')).toBe('deep')
  })
  it('falls back to circle default when there is no member override', () => {
    expect(resolveTier(null, 'spark', 'current')).toBe('spark')
    expect(resolveTier(undefined, 'spark', 'current')).toBe('spark')
  })
  it('falls back to the item default when neither member nor circle is set', () => {
    expect(resolveTier(null, null, 'deep')).toBe('deep')
  })
  it('falls back to current when nothing is set', () => {
    expect(resolveTier(null, null, null)).toBe('current')
    expect(resolveTier(undefined, undefined, undefined)).toBe(DEFAULT_TIER)
  })
})

describe('isIntensityTier', () => {
  it('accepts the three canonical tiers', () => {
    for (const t of INTENSITY_TIERS) expect(isIntensityTier(t)).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['Deep', '', 'casual', null, undefined, 0, {}]) {
      expect(isIntensityTier(v)).toBe(false)
    }
  })
})
