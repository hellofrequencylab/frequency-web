import { describe, it, expect } from 'vitest'
import { rollSurprise, SURPRISE_DAILY_RATE, type SurpriseTier } from '@/lib/surprises'

const PROFILE = '11111111-1111-1111-1111-111111111111'

describe('rollSurprise — determinism', () => {
  it('returns the same result for the same (profile, day)', () => {
    const a = rollSurprise(PROFILE, '2026-06-10')
    const b = rollSurprise(PROFILE, '2026-06-10')
    expect(a).toEqual(b)
  })

  it('guards empty inputs', () => {
    expect(rollSurprise('', '2026-06-10')).toBeNull()
    expect(rollSurprise(PROFILE, '')).toBeNull()
  })

  it('keys the grant one-per-member-per-day (date-only rule key)', () => {
    // Scan forward until we land on a surprise day, then assert the key shape.
    for (let d = 1; d <= 60; d++) {
      const day = `2026-06-${String(d).padStart(2, '0')}`
      const s = rollSurprise(PROFILE, day)
      if (s) {
        expect(s.key).toBe(`surprise:${day}`)
        return
      }
    }
    throw new Error('expected at least one surprise day within 60 days')
  })
})

describe('rollSurprise — magnitude bounds', () => {
  it('only ever pays a known tier + bounded amount', () => {
    const tiers: Record<SurpriseTier, number> = { common: 0, rare: 0, gleam: 0 }
    for (let d = 0; d < 4000; d++) {
      const day = new Date(2026, 0, 1 + d).toISOString().slice(0, 10)
      const s = rollSurprise(PROFILE, day)
      if (!s) continue
      tiers[s.tier]++
      expect(s.amount).toBeGreaterThan(0)
      if (s.tier === 'common') {
        expect(s.amount).toBeGreaterThanOrEqual(6)
        expect(s.amount).toBeLessThanOrEqual(12)
      }
      if (s.tier === 'rare') expect(s.amount).toBe(25)
      if (s.tier === 'gleam') expect(s.amount).toBe(50)
      // The label never carries an em dash (CONTENT-VOICE hard rule).
      expect(s.label).not.toContain('—')
    }
    // Every tier should appear over a few thousand samples.
    expect(tiers.common).toBeGreaterThan(0)
    expect(tiers.rare).toBeGreaterThan(0)
    expect(tiers.gleam).toBeGreaterThan(0)
    // Common is by far the most frequent tier.
    expect(tiers.common).toBeGreaterThan(tiers.rare)
    expect(tiers.rare).toBeGreaterThan(tiers.gleam)
  })
})

describe('rollSurprise — hit rate distribution', () => {
  it('hits roughly SURPRISE_DAILY_RATE of active days across many members', () => {
    let hits = 0
    let total = 0
    for (let p = 0; p < 400; p++) {
      const profile = `profile-${p}`
      for (let d = 0; d < 30; d++) {
        const day = new Date(2026, 2, 1 + d).toISOString().slice(0, 10)
        total++
        if (rollSurprise(profile, day)) hits++
      }
    }
    const rate = hits / total
    // 12,000 samples — the observed rate should sit close to the configured rate.
    expect(rate).toBeGreaterThan(SURPRISE_DAILY_RATE - 0.03)
    expect(rate).toBeLessThan(SURPRISE_DAILY_RATE + 0.03)
  })
})
