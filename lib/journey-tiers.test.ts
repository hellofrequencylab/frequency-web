import { describe, it, expect } from 'vitest'
import { resolveTier, isIntensityTier, DEFAULT_TIER, INTENSITY_TIERS } from '@/lib/journey-tiers'

describe('resolveTier', () => {
  it('member override wins over circle and item', () => {
    expect(resolveTier('master', 'initiate', 'adept')).toBe('master')
  })
  it('falls back to circle default when there is no member override', () => {
    expect(resolveTier(null, 'initiate', 'adept')).toBe('initiate')
    expect(resolveTier(undefined, 'initiate', 'adept')).toBe('initiate')
  })
  it('falls back to the item default when neither member nor circle is set', () => {
    expect(resolveTier(null, null, 'master')).toBe('master')
  })
  it('falls back to adept when nothing is set', () => {
    expect(resolveTier(null, null, null)).toBe('adept')
    expect(resolveTier(undefined, undefined, undefined)).toBe(DEFAULT_TIER)
  })
})

describe('isIntensityTier', () => {
  it('accepts the three canonical tiers', () => {
    for (const t of INTENSITY_TIERS) expect(isIntensityTier(t)).toBe(true)
  })
  it('rejects anything else', () => {
    for (const v of ['Master', '', 'casual', null, undefined, 0, {}]) {
      expect(isIntensityTier(v)).toBe(false)
    }
  })
})
