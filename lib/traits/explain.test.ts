import { describe, it, expect } from 'vitest'
import {
  explainChurnRisk,
  explainActivationPropensity,
  explainResonanceHealth,
  churnRisk,
  activationPropensity,
  resonanceHealth,
  type PredictiveInputs,
  type ResonanceHealthInputs,
} from './compute'

// Explainability (Resonance Engine Phase 3 · ADR-384). The "why" behind every score: each
// explain* sibling returns the SAME numeric/enum verdict as its base function (additive, never a
// breaking change) PLUS an ordered, capped drivers array + a confidence band. PURE + deterministic.

const predBase: PredictiveInputs = {
  lifecycle: 'engaged',
  rfmScore: 54, // recency 5, frequency 4
  activated: true,
  engagementDepth: 'deep',
  interactionDays30: 10,
  surfaces30: 5,
  sessions30: 6,
  tenureDays: 90,
}

describe('explainChurnRisk', () => {
  it('returns the SAME verdict as churnRisk (additive, never breaks the base)', () => {
    const cases: PredictiveInputs[] = [
      predBase,
      { ...predBase, lifecycle: 'dormant', engagementDepth: 'idle', activated: false },
      { ...predBase, lifecycle: 'at_risk', engagementDepth: 'shallow', rfmScore: 21 },
      { ...predBase, lifecycle: 'new', engagementDepth: 'idle', activated: false, rfmScore: 11 },
    ]
    for (const p of cases) expect(explainChurnRisk(p).value).toBe(churnRisk(p))
  })

  it('lifecycle leads the drivers (the band-setter is most decisive)', () => {
    const out = explainChurnRisk({ ...predBase, lifecycle: 'dormant', engagementDepth: 'idle' })
    expect(out.reasons[0].signal).toBe('lifecycle')
    expect(out.reasons[0].label).toBe('has gone quiet')
  })

  it('caps the drivers at three, ordered most-decisive first', () => {
    const out = explainChurnRisk({ ...predBase, lifecycle: 'at_risk', engagementDepth: 'idle', rfmScore: 11 })
    expect(out.reasons.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < out.reasons.length; i++) {
      expect(out.reasons[i - 1].weight).toBeGreaterThanOrEqual(out.reasons[i].weight)
    }
  })

  it('is deterministic: same inputs give the same drivers in the same order', () => {
    const p: PredictiveInputs = { ...predBase, lifecycle: 'at_risk', engagementDepth: 'shallow', rfmScore: 21 }
    expect(explainChurnRisk(p)).toEqual(explainChurnRisk(p))
  })

  it('confidence: high at the dormant end, low for a brand-new idle account', () => {
    expect(explainChurnRisk({ ...predBase, lifecycle: 'dormant' }).confidence).toBe('high')
    expect(
      explainChurnRisk({ ...predBase, lifecycle: 'new', engagementDepth: 'idle', activated: false }).confidence,
    ).toBe('low')
    expect(
      explainChurnRisk({ ...predBase, lifecycle: 'engaged', engagementDepth: 'deep' }).confidence,
    ).toBe('high')
  })

  it('every driver label is free of em and en dashes (brand voice law)', () => {
    const out = explainChurnRisk({ ...predBase, lifecycle: 'at_risk', engagementDepth: 'idle' })
    for (const r of out.reasons) expect(r.label).not.toMatch(/[–—]/)
  })
})

describe('explainActivationPropensity', () => {
  it('returns the SAME number as activationPropensity', () => {
    const cases: PredictiveInputs[] = [
      predBase,
      { ...predBase, activated: false, interactionDays30: 0, surfaces30: 0, sessions30: 0, tenureDays: 3 },
      { ...predBase, activated: false, interactionDays30: 5, surfaces30: 4, sessions30: 3, tenureDays: 20 },
    ]
    for (const p of cases) expect(explainActivationPropensity(p).value).toBe(activationPropensity(p))
  })

  it('an already-activated member is a fully-confident special case', () => {
    const out = explainActivationPropensity({ ...predBase, activated: true })
    expect(out.value).toBe(100)
    expect(out.confidence).toBe('high')
    expect(out.reasons[0].signal).toBe('activated')
  })

  it('a member with no early signal reads low confidence, with a plain "too little signal" driver', () => {
    const out = explainActivationPropensity({
      ...predBase,
      activated: false,
      interactionDays30: 0,
      surfaces30: 0,
      sessions30: 0,
      tenureDays: 30,
    })
    expect(out.confidence).toBe('low')
    expect(out.reasons.length).toBeGreaterThan(0)
  })

  it('two or more early signals read high confidence', () => {
    const out = explainActivationPropensity({
      ...predBase,
      activated: false,
      interactionDays30: 4,
      surfaces30: 3,
      sessions30: 0,
      tenureDays: 10,
    })
    expect(out.confidence).toBe('high')
  })
})

describe('explainResonanceHealth', () => {
  const healthBase: ResonanceHealthInputs = {
    engagementDepth: 'deep',
    rfmScore: 54,
    weeklyActive: true,
    churnRisk: 'low',
  }

  it('returns the SAME number as resonanceHealth', () => {
    const cases: ResonanceHealthInputs[] = [
      healthBase,
      { engagementDepth: 'idle', rfmScore: 11, weeklyActive: false, churnRisk: 'high' },
      { engagementDepth: 'moderate', rfmScore: 33, weeklyActive: false, churnRisk: 'medium' },
    ]
    for (const p of cases) expect(explainResonanceHealth(p).value).toBe(resonanceHealth(p))
  })

  it('the strongest contributor leads (all signals strong -> engagement depth leads)', () => {
    const out = explainResonanceHealth(healthBase)
    expect(out.reasons[0].signal).toBe('engagement_depth')
    expect(out.confidence).toBe('high')
  })

  it('all signals weak reads high confidence (they agree, just the other way)', () => {
    const out = explainResonanceHealth({ engagementDepth: 'idle', rfmScore: 11, weeklyActive: false, churnRisk: 'high' })
    expect(out.confidence).toBe('high')
  })

  it('conflicting signals (deep engagement but high churn) read LOW confidence', () => {
    const out = explainResonanceHealth({ engagementDepth: 'deep', rfmScore: 54, weeklyActive: true, churnRisk: 'high' })
    expect(out.confidence).toBe('low')
  })

  it('caps at three drivers and is deterministic', () => {
    const out = explainResonanceHealth(healthBase)
    expect(out.reasons.length).toBeLessThanOrEqual(3)
    expect(explainResonanceHealth(healthBase)).toEqual(explainResonanceHealth(healthBase))
  })
})
