import { describe, it, expect } from 'vitest'
import { estimateCostUsd, withinBudget, dailyCapFor } from './budget'

describe('estimateCostUsd', () => {
  it('prices haiku input + output at list rate', () => {
    // 1M input ($1) + 1M output ($5) at haiku = $6
    expect(estimateCostUsd('haiku', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(6)
  })

  it('scales linearly with tokens', () => {
    expect(estimateCostUsd('haiku', { inputTokens: 500_000, outputTokens: 0 })).toBeCloseTo(0.5)
  })

  it('charges more for higher tiers', () => {
    const u = { inputTokens: 100_000, outputTokens: 100_000 }
    expect(estimateCostUsd('opus', u)).toBeGreaterThan(estimateCostUsd('sonnet', u))
    expect(estimateCostUsd('sonnet', u)).toBeGreaterThan(estimateCostUsd('haiku', u))
  })

  it('is zero for an empty call', () => {
    expect(estimateCostUsd('haiku', { inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

describe('withinBudget', () => {
  it('allows a call comfortably under the cap', () => {
    expect(withinBudget(1, 0.5, 2)).toBe(true)
  })

  it('allows a call landing exactly on the cap', () => {
    expect(withinBudget(1.5, 0.5, 2)).toBe(true)
  })

  it('blocks a call that would exceed the cap', () => {
    expect(withinBudget(1.8, 0.5, 2)).toBe(false)
  })
})

describe('dailyCapFor', () => {
  it('returns the configured cap for a known feature', () => {
    expect(dailyCapFor('help-search')).toBe(5)
  })

  it('falls back for an unknown feature', () => {
    expect(dailyCapFor('does-not-exist', 1)).toBe(1)
  })

  // ADR-993: the two generalized Studio capabilities each carry their OWN key, so a member-facing
  // surface can never silently inherit the $1 fallback or eat the operator studio's headroom.
  it('caps the generalized Studio surfaces deliberately', () => {
    // ~$0.02 per Sonnet read, so roughly 200 pre-publish reads a day across every entity.
    expect(dailyCapFor('entity-review')).toBe(4)
    // $0.04 per Recraft raster generation, so 50 drawn covers a day. Separate from the operator
    // Loom Studio's own 'recraft' cap, which is bigger and serves a different job.
    expect(dailyCapFor('entity-cover')).toBe(2)
    expect(dailyCapFor('entity-cover')).toBeLessThan(dailyCapFor('recraft'))
  })
})
