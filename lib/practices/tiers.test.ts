import { describe, it, expect } from 'vitest'
import { maxTierForDuration, isTierAllowed, clampTierToDuration, coerceTierZaps, tierForZaps, TIER_FLOOR_MIN, TIER_ZAPS } from './tiers'

describe('practice tiers — time vs points (ADR-442)', () => {
  it('maps a duration to the highest tier it earns', () => {
    expect(maxTierForDuration(null)).toBe('light')
    expect(maxTierForDuration(undefined)).toBe('light')
    expect(maxTierForDuration(0)).toBe('light')
    expect(maxTierForDuration(4)).toBe('light')
    expect(maxTierForDuration(5)).toBe('standard')
    expect(maxTierForDuration(14)).toBe('standard')
    expect(maxTierForDuration(15)).toBe('heavy')
    expect(maxTierForDuration(60)).toBe('heavy')
    expect(maxTierForDuration(Number.NaN)).toBe('light')
  })

  it('allows lower tiers, blocks tiers above the duration floor', () => {
    expect(isTierAllowed('light', 2)).toBe(true)
    expect(isTierAllowed('standard', 2)).toBe(false)
    expect(isTierAllowed('heavy', 10)).toBe(false)
    expect(isTierAllowed('standard', 5)).toBe(true)
    expect(isTierAllowed('heavy', 15)).toBe(true)
    expect(isTierAllowed('light', 60)).toBe(true) // under-claim is fine
  })

  it('clamps a requested tier down to what the duration earns, never up', () => {
    expect(clampTierToDuration('heavy', 3)).toBe('light')
    expect(clampTierToDuration('heavy', 10)).toBe('standard')
    expect(clampTierToDuration('heavy', 20)).toBe('heavy')
    expect(clampTierToDuration('standard', null)).toBe('light')
    expect(clampTierToDuration('light', 60)).toBe('light') // never upgrades on its own
  })

  it('keeps the canon floors and default amounts', () => {
    expect(TIER_FLOOR_MIN).toEqual({ light: 0, standard: 5, heavy: 15 })
    expect(TIER_ZAPS).toEqual({ light: 8, standard: 12, heavy: 15 })
  })

  it('snaps an arbitrary value to the nearest allowed tier amount', () => {
    expect(coerceTierZaps(8)).toBe(8)
    expect(coerceTierZaps(12)).toBe(12)
    expect(coerceTierZaps(15)).toBe(15)
    expect(coerceTierZaps(500)).toBe(15) // no unlimited
    expect(coerceTierZaps(1)).toBe(8)
    expect(coerceTierZaps(13)).toBe(12)
    expect(coerceTierZaps(Number.NaN)).toBe(12)
  })

  it('maps a stored value back to its tier for preselecting a picker', () => {
    expect(tierForZaps(8)).toBe('light')
    expect(tierForZaps(12)).toBe('standard')
    expect(tierForZaps(15)).toBe('heavy')
    expect(tierForZaps(999)).toBe('heavy')
  })
})
