import { describe, it, expect } from 'vitest'
import {
  rollSurprise,
  rollZapSurprise,
  SURPRISE_DAILY_RATE,
  ZAP_SURPRISE_RATE,
  ZAP_SURPRISE_ACTS,
  type SurpriseTier,
} from '@/lib/surprises'

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

describe('gems vs zaps — kind + key', () => {
  it('tags the gems roll and keys it date-only', () => {
    for (let d = 1; d <= 60; d++) {
      const day = `2026-06-${String(d).padStart(2, '0')}`
      const s = rollSurprise(PROFILE, day)
      if (s) {
        expect(s.kind).toBe('gems')
        expect(s.key).toBe(`surprise:${day}`)
        expect(s.label).toContain('gems')
        return
      }
    }
    throw new Error('expected a gems surprise within 60 days')
  })

  it('tags the zaps roll, keys it distinctly, and bounds the amount', () => {
    for (let d = 1; d <= 90; d++) {
      const day = `2026-06-${String(d).padStart(2, '0')}`
      const s = rollZapSurprise(PROFILE, day)
      if (s) {
        expect(s.kind).toBe('zaps')
        expect(s.key).toBe(`surprise.zaps:${day}`)
        expect(s.label).toContain('zaps')
        expect(s.label).not.toContain('—')
        // Zap amounts stay modest: common 3-6 / rare 12 / gleam 25.
        expect(s.amount).toBeGreaterThanOrEqual(3)
        expect(s.amount).toBeLessThanOrEqual(25)
        return
      }
    }
    throw new Error('expected a zaps surprise within 90 days')
  })

  it('rolls gems and zaps independently (distinct seeds → not identical day sets)', () => {
    let same = 0
    let total = 0
    for (let d = 0; d < 200; d++) {
      const day = new Date(2026, 4, 1 + d).toISOString().slice(0, 10)
      total++
      if (!!rollSurprise(PROFILE, day) === !!rollZapSurprise(PROFILE, day)) same++
    }
    // If the two rolls were the same draw, "both agree" would be ~100%. Independent
    // rolls disagree on a meaningful fraction of days.
    expect(same).toBeLessThan(total)
  })
})

describe('rollZapSurprise — determinism + distribution', () => {
  it('returns the same result for the same (profile, day)', () => {
    expect(rollZapSurprise(PROFILE, '2026-06-10')).toEqual(rollZapSurprise(PROFILE, '2026-06-10'))
  })

  it('guards empty inputs', () => {
    expect(rollZapSurprise('', '2026-06-10')).toBeNull()
    expect(rollZapSurprise(PROFILE, '')).toBeNull()
  })

  it('hits roughly ZAP_SURPRISE_RATE across many members', () => {
    let hits = 0
    let total = 0
    for (let p = 0; p < 400; p++) {
      for (let d = 0; d < 30; d++) {
        const day = new Date(2026, 6, 1 + d).toISOString().slice(0, 10)
        total++
        if (rollZapSurprise(`zap-${p}`, day)) hits++
      }
    }
    const rate = hits / total
    expect(rate).toBeGreaterThan(ZAP_SURPRISE_RATE - 0.03)
    expect(rate).toBeLessThan(ZAP_SURPRISE_RATE + 0.03)
  })

  it('gates Zap surprises to the real-world Zap-earning acts only', () => {
    expect([...ZAP_SURPRISE_ACTS].sort()).toEqual(
      ['event_attend', 'event_host', 'qr_scan', 'referral', 'task_complete'].sort(),
    )
    // Personal / online acts are deliberately excluded (they get the gems surprise).
    expect(ZAP_SURPRISE_ACTS.has('practice_log')).toBe(false)
    expect(ZAP_SURPRISE_ACTS.has('post_create')).toBe(false)
    expect(ZAP_SURPRISE_ACTS.has('circle_join')).toBe(false)
  })
})
