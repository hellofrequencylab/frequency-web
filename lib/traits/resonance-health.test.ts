import { describe, it, expect } from 'vitest'
import {
  resonanceHealth,
  resonanceTier,
  computeResonanceTraits,
  resonanceHealthInputs,
  type ResonanceHealthInputs,
  type MemberStats,
  type InteractionStats,
} from './compute'

// Resonance Health (ADR-383) — the one shared 0-100 dashboard score + its three-color
// tier. PURE rollup, so it is fully unit-tested here (the rollup math + the tiering +
// the trait emission + the input assembly), no DB.

const DAY = 86_400_000
const NOW = Date.parse('2026-06-03T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()

describe('resonanceHealth', () => {
  it('scores a deeply engaged, weekly-active, low-churn member near the top', () => {
    const h = resonanceHealth({ engagementDepth: 'deep', rfmScore: 55, weeklyActive: true, churnRisk: 'low' })
    // All four terms maxed -> 100.
    expect(h).toBe(100)
  })

  it('scores an idle, lapsed, high-churn member near the floor', () => {
    const h = resonanceHealth({ engagementDepth: 'idle', rfmScore: 11, weeklyActive: false, churnRisk: 'high' })
    expect(h).toBe(0)
  })

  it('always lands in [0, 100], even on malformed RFM', () => {
    const high = resonanceHealth({ engagementDepth: 'deep', rfmScore: 9999, weeklyActive: true, churnRisk: 'low' })
    const low = resonanceHealth({ engagementDepth: 'idle', rfmScore: -50, weeklyActive: false, churnRisk: 'high' })
    const nan = resonanceHealth({ engagementDepth: 'moderate', rfmScore: Number.NaN, weeklyActive: true, churnRisk: 'medium' })
    expect(high).toBeLessThanOrEqual(100)
    expect(high).toBeGreaterThanOrEqual(0)
    expect(low).toBe(0)
    expect(nan).toBeGreaterThanOrEqual(0)
    expect(nan).toBeLessThanOrEqual(100)
  })

  it('churn risk drags the score down for an otherwise-identical member', () => {
    const base: Omit<ResonanceHealthInputs, 'churnRisk'> = {
      engagementDepth: 'moderate',
      rfmScore: 33,
      weeklyActive: true,
    }
    const low = resonanceHealth({ ...base, churnRisk: 'low' })
    const med = resonanceHealth({ ...base, churnRisk: 'medium' })
    const high = resonanceHealth({ ...base, churnRisk: 'high' })
    expect(low).toBeGreaterThan(med)
    expect(med).toBeGreaterThan(high)
  })

  it('engagement depth moves the score monotonically', () => {
    const base: Omit<ResonanceHealthInputs, 'engagementDepth'> = {
      rfmScore: 33,
      weeklyActive: false,
      churnRisk: 'medium',
    }
    const idle = resonanceHealth({ ...base, engagementDepth: 'idle' })
    const shallow = resonanceHealth({ ...base, engagementDepth: 'shallow' })
    const moderate = resonanceHealth({ ...base, engagementDepth: 'moderate' })
    const deep = resonanceHealth({ ...base, engagementDepth: 'deep' })
    expect(shallow).toBeGreaterThan(idle)
    expect(moderate).toBeGreaterThan(shallow)
    expect(deep).toBeGreaterThan(moderate)
  })
})

describe('resonanceTier', () => {
  it('bands the score into the three-color legend', () => {
    expect(resonanceTier(100)).toBe('resonant')
    expect(resonanceTier(67)).toBe('resonant')
    expect(resonanceTier(66)).toBe('cooling')
    expect(resonanceTier(34)).toBe('cooling')
    expect(resonanceTier(33)).toBe('at_risk')
    expect(resonanceTier(0)).toBe('at_risk')
  })

  it('treats a malformed score as at risk (fail-safe to the loudest tier)', () => {
    expect(resonanceTier(Number.NaN)).toBe('at_risk')
    expect(resonanceTier(-10)).toBe('at_risk')
  })
})

describe('computeResonanceTraits', () => {
  it('emits both the health number and the matching tier under the registry keys', () => {
    const traits = computeResonanceTraits({ engagementDepth: 'deep', rfmScore: 55, weeklyActive: true, churnRisk: 'low' })
    const byKey = new Map(traits.map((t) => [t.key, t]))
    expect(byKey.get('resonance_health')?.type).toBe('number')
    expect(byKey.get('resonance_health')?.value).toBe(100)
    expect(byKey.get('resonance_tier')?.type).toBe('enum')
    expect(byKey.get('resonance_tier')?.value).toBe('resonant')
  })

  it('keeps the tier consistent with the health it emits', () => {
    const traits = computeResonanceTraits({ engagementDepth: 'idle', rfmScore: 11, weeklyActive: false, churnRisk: 'high' })
    const byKey = new Map(traits.map((t) => [t.key, t]))
    expect(byKey.get('resonance_health')?.value).toBe(0)
    expect(byKey.get('resonance_tier')?.value).toBe('at_risk')
  })
})

describe('resonanceHealthInputs', () => {
  it('assembles inputs from the member + interaction stat views (a healthy member)', () => {
    const stats: MemberStats = {
      createdAt: ago(120),
      lastEventAt: ago(1),
      firstVerifiedPracticeAt: ago(100),
      distinctActiveDays30: 20,
      verifiedPractices7d: 4,
      eventCount30d: 30,
    }
    const istats: InteractionStats = {
      lastInteractionAt: ago(1),
      interactionCount30: 60,
      interactionDays30: 12,
      surfacesTouched30: 6,
      dwellMs30: 40 * 60_000,
      sessions30: 15,
      scrollDepthAvg: 70,
    }
    const inputs = resonanceHealthInputs(stats, istats, NOW)
    expect(inputs.weeklyActive).toBe(true)
    expect(inputs.engagementDepth).toBe('deep')
    expect(inputs.churnRisk).toBe('low')
    // The healthy member rolls up to the resonant tier.
    expect(resonanceTier(resonanceHealth(inputs))).toBe('resonant')
  })

  it('rolls a dormant member down to the at-risk tier', () => {
    const stats: MemberStats = {
      createdAt: ago(200),
      lastEventAt: ago(60),
      firstVerifiedPracticeAt: ago(150),
      distinctActiveDays30: 0,
      verifiedPractices7d: 0,
      eventCount30d: 0,
    }
    const istats: InteractionStats = {
      lastInteractionAt: ago(60),
      interactionCount30: 0,
      interactionDays30: 0,
      surfacesTouched30: 0,
      dwellMs30: 0,
      sessions30: 0,
      scrollDepthAvg: 0,
    }
    const inputs = resonanceHealthInputs(stats, istats, NOW)
    expect(inputs.weeklyActive).toBe(false)
    expect(inputs.churnRisk).toBe('high')
    expect(resonanceTier(resonanceHealth(inputs))).toBe('at_risk')
  })
})
