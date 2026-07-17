import { describe, it, expect } from 'vitest'
import { maxTierForDuration, isTierAllowed, clampTierToDuration, coerceTierZaps, tierForZaps, achievedTier, achievedTierFromMinutes, LIGHT_FLOOR_MIN, TIER_FLOOR_MIN, TIER_ZAPS } from './tiers'

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

  it('resolves the achieved tier from real engaged time (ADR-443)', () => {
    // minutes
    expect(achievedTierFromMinutes(0)).toBe('partial')
    expect(achievedTierFromMinutes(LIGHT_FLOOR_MIN - 0.1)).toBe('partial') // 2 min into a 10-min sit
    expect(achievedTierFromMinutes(LIGHT_FLOOR_MIN)).toBe('light')
    expect(achievedTierFromMinutes(4)).toBe('light')
    expect(achievedTierFromMinutes(5)).toBe('standard')
    expect(achievedTierFromMinutes(14)).toBe('standard')
    expect(achievedTierFromMinutes(15)).toBe('heavy')
    expect(achievedTierFromMinutes(60)).toBe('heavy')
    expect(achievedTierFromMinutes(Number.NaN)).toBe('partial')
    // seconds
    expect(achievedTier(120)).toBe('partial') // 2 min
    expect(achievedTier(5 * 60)).toBe('standard')
    expect(achievedTier(15 * 60)).toBe('heavy')
  })

  it('the partial floor: any engaged time under the Light floor is a partial (banks 1 Zap)', () => {
    // Below LIGHT_FLOOR_MIN the sit clears the day + streak but pays only 1 Zap (logPractice).
    // The pure gate here is that the OUTCOME is 'partial' — never a real tier — for anything short.
    expect(achievedTier(0)).toBe('partial')
    expect(achievedTier((LIGHT_FLOOR_MIN * 60) - 1)).toBe('partial') // one second under the floor
    // Exactly the Light floor is the first REAL tier (the day earns Light, not a partial).
    expect(achievedTier(LIGHT_FLOOR_MIN * 60)).toBe('light')
  })

  it('quick-log fallback: a no-timer log keeps the RECOMMENDED tier, not an achieved one', () => {
    // A quick-log practice (timer_kind = 'none') has no engaged time to measure, so logPractice
    // never runs achievedTier on it — the reward is the creator's recommended weight class,
    // preselected from its stored Zap value. That resolution is coerceTierZaps / tierForZaps:
    expect(tierForZaps(TIER_ZAPS.light)).toBe('light')
    expect(tierForZaps(TIER_ZAPS.standard)).toBe('standard')
    expect(tierForZaps(TIER_ZAPS.heavy)).toBe('heavy')
    // A stored value is snapped to an allowed amount (never an arbitrary quick-log payout).
    expect(coerceTierZaps(TIER_ZAPS.heavy + 100)).toBe(TIER_ZAPS.heavy)
  })
})
