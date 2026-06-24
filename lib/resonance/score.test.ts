import { describe, it, expect } from 'vitest'
import {
  affinity,
  receptiveness,
  want,
  harmonicMean,
  resonanceScore,
  resonanceReasons,
  type ResonanceParty,
  type ResonanceAffinity,
} from './score'

const NO_EDGES: ResonanceAffinity = {
  sharedCircles: 0,
  sharedJourneys: 0,
  sharedPractices: 0,
  sharedPillars: 0,
}

const party = (over: Partial<ResonanceParty> = {}): ResonanceParty => ({
  pid: 'a',
  activationPropensity: 50,
  churnRisk: 'low',
  ...over,
})

describe('affinity (raw overlap)', () => {
  it('is 0 with no shared edges and no embedding', () => {
    expect(affinity(NO_EDGES)).toBe(0)
  })

  it('rises with more shared edges and stays in [0, 1]', () => {
    const one = affinity({ ...NO_EDGES, sharedCircles: 1 })
    const many = affinity({ sharedCircles: 5, sharedJourneys: 5, sharedPractices: 5, sharedPillars: 5 })
    expect(one).toBeGreaterThan(0)
    expect(many).toBeGreaterThan(one)
    expect(many).toBeLessThanOrEqual(1)
  })

  it('has diminishing returns (the 2nd shared Circle adds less than the 1st)', () => {
    const a1 = affinity({ ...NO_EDGES, sharedCircles: 1 })
    const a2 = affinity({ ...NO_EDGES, sharedCircles: 2 })
    const a3 = affinity({ ...NO_EDGES, sharedCircles: 3 })
    expect(a2 - a1).toBeGreaterThan(a3 - a2)
  })

  it('is symmetric (shared edges are mutual)', () => {
    const aff: ResonanceAffinity = { sharedCircles: 2, sharedJourneys: 1, sharedPractices: 0, sharedPillars: 3 }
    expect(affinity(aff)).toBe(affinity({ ...aff }))
  })

  it('folds in embedding similarity when present, ignores it when null', () => {
    const withSim = affinity({ ...NO_EDGES, sharedCircles: 1, embeddingSimilarity: 0.9 })
    const withoutSim = affinity({ ...NO_EDGES, sharedCircles: 1, embeddingSimilarity: null })
    expect(withSim).toBeGreaterThan(withoutSim)
    // A null embedding must degrade to exactly the structural-only score (fail-safe layer).
    expect(withoutSim).toBe(affinity({ ...NO_EDGES, sharedCircles: 1 }))
  })

  it('clamps an out-of-range embedding similarity', () => {
    const over = affinity({ ...NO_EDGES, sharedCircles: 1, embeddingSimilarity: 5 })
    expect(over).toBeLessThanOrEqual(1)
    const under = affinity({ ...NO_EDGES, sharedCircles: 1, embeddingSimilarity: -3 })
    expect(under).toBeGreaterThanOrEqual(0)
  })
})

describe('receptiveness (target down/up-weight)', () => {
  it('a low-churn, high-propensity member is the best target', () => {
    const best = receptiveness(party({ activationPropensity: 100, churnRisk: 'low' }))
    const worst = receptiveness(party({ activationPropensity: 0, churnRisk: 'high' }))
    expect(best).toBeGreaterThan(worst)
    expect(best).toBeLessThanOrEqual(1)
    expect(worst).toBeGreaterThanOrEqual(0)
  })

  it('churn down-weights a high-propensity target (do not route an at-risk member as a target)', () => {
    const healthy = receptiveness(party({ activationPropensity: 80, churnRisk: 'low' }))
    const atRisk = receptiveness(party({ activationPropensity: 80, churnRisk: 'high' }))
    expect(atRisk).toBeLessThan(healthy)
  })
})

describe('harmonicMean (the reciprocity engine)', () => {
  it('is 0 when either side is 0', () => {
    expect(harmonicMean(0.9, 0)).toBe(0)
    expect(harmonicMean(0, 0.9)).toBe(0)
  })

  it('punishes a one-sided pair (drags toward the smaller value)', () => {
    const oneSided = harmonicMean(0.9, 0.1)
    const arithmeticMean = (0.9 + 0.1) / 2
    expect(oneSided).toBeLessThan(arithmeticMean)
    expect(oneSided).toBeLessThan(0.2)
  })

  it('equals the value when both sides agree', () => {
    expect(harmonicMean(0.5, 0.5)).toBeCloseTo(0.5)
  })
})

describe('resonanceScore (reciprocal, consent-first re-ranker)', () => {
  const aff: ResonanceAffinity = { sharedCircles: 2, sharedJourneys: 1, sharedPractices: 0, sharedPillars: 1 }

  it('is symmetric: score(A,B) === score(B,A)', () => {
    const a = party({ pid: 'a', activationPropensity: 70, churnRisk: 'low' })
    const b = party({ pid: 'b', activationPropensity: 40, churnRisk: 'medium' })
    expect(resonanceScore(a, b, aff)).toBeCloseTo(resonanceScore(b, a, aff))
  })

  it('collapses a one-sided match (a quiet, at-risk member vs a healthy one)', () => {
    const healthy = party({ pid: 'h', activationPropensity: 90, churnRisk: 'low' })
    const atRisk = party({ pid: 'r', activationPropensity: 5, churnRisk: 'high' })
    const mutual = party({ pid: 'm', activationPropensity: 90, churnRisk: 'low' })
    const oneSided = resonanceScore(healthy, atRisk, aff)
    const reciprocal = resonanceScore(healthy, mutual, aff)
    expect(oneSided).toBeLessThan(reciprocal)
  })

  it('is 0 when there is no shared affinity', () => {
    const a = party({ pid: 'a' })
    const b = party({ pid: 'b' })
    expect(resonanceScore(a, b, NO_EDGES)).toBe(0)
  })

  it('stays in [0, 1]', () => {
    const a = party({ pid: 'a', activationPropensity: 100, churnRisk: 'low' })
    const b = party({ pid: 'b', activationPropensity: 100, churnRisk: 'low' })
    const maxAff: ResonanceAffinity = {
      sharedCircles: 9,
      sharedJourneys: 9,
      sharedPractices: 9,
      sharedPillars: 9,
      embeddingSimilarity: 1,
    }
    const s = resonanceScore(a, b, maxAff)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('resonanceReasons (the plain-language WHY)', () => {
  it('names shared belonging, most-decisive first, capped', () => {
    const reasons = resonanceReasons(
      { sharedCircles: 1, sharedJourneys: 1, sharedPractices: 1, sharedPillars: 1 },
      2,
    )
    expect(reasons.length).toBe(2)
    expect(reasons[0].kind).toBe('circle')
  })

  it('uses no em or en dashes (brand voice law)', () => {
    const reasons = resonanceReasons({ sharedCircles: 2, sharedJourneys: 3, sharedPractices: 1, sharedPillars: 2 }, 4)
    for (const r of reasons) expect(r.label).not.toMatch(/[–—]/)
  })

  it('falls back to a generic affinity line for an embedding-only match', () => {
    const reasons = resonanceReasons({ ...NO_EDGES, embeddingSimilarity: 0.8 })
    expect(reasons.length).toBe(1)
    expect(reasons[0].kind).toBe('affinity')
  })

  it('returns nothing when there is no shared edge and no embedding', () => {
    expect(resonanceReasons(NO_EDGES)).toEqual([])
  })

  it('singular vs plural copy', () => {
    expect(resonanceReasons({ ...NO_EDGES, sharedCircles: 1 })[0].label).toContain('the same Circle')
    expect(resonanceReasons({ ...NO_EDGES, sharedCircles: 3 })[0].label).toContain('3 Circles')
  })
})

describe('want (directional gain)', () => {
  it('is the affinity weighted by the target receptiveness', () => {
    const target = party({ activationPropensity: 100, churnRisk: 'low' })
    expect(want(1, target)).toBeCloseTo(receptiveness(target))
    expect(want(0, target)).toBe(0)
  })
})
