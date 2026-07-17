import { describe, it, expect } from 'vitest'
import {
  scoreUpgrade,
  UPGRADE_THRESHOLDS,
  UPGRADE_WEIGHTS,
  NO_UPGRADE_SIGNAL,
  type UpgradeSignalInput,
} from './upgrade-signal'

// The R5 upgrade heuristic is a pure, threshold-based blend, so every band + the candidate cut is
// deterministically testable. These lock the transparency guarantee: the score is exactly the sum of
// the earned bands, and an already-business member is never a candidate.

const BASE: UpgradeSignalInput = {
  isBusiness: false,
  communityRole: null,
  spacesOwned: 0,
  activationPropensity: null,
  rfmScore: null,
  resonanceHealth: null,
  wamStatus: null,
}

describe('scoreUpgrade — the pure upgrade-to-business heuristic', () => {
  it('never flags a member who is already a business', () => {
    const signal = scoreUpgrade({
      ...BASE,
      isBusiness: true,
      communityRole: 'host',
      spacesOwned: 2,
      activationPropensity: 100,
      rfmScore: 100,
      resonanceHealth: 100,
      wamStatus: true,
    })
    expect(signal).toEqual(NO_UPGRADE_SIGNAL)
  })

  it('scores nothing for a bare lead with no signals', () => {
    const signal = scoreUpgrade(BASE)
    expect(signal.score).toBe(0)
    expect(signal.isCandidate).toBe(false)
    expect(signal.reasons).toEqual([])
  })

  it('sums exactly the bands earned (leadership + activation)', () => {
    const signal = scoreUpgrade({
      ...BASE,
      communityRole: 'host',
      activationPropensity: UPGRADE_THRESHOLDS.highActivation,
    })
    expect(signal.score).toBe(UPGRADE_WEIGHTS.leadership + UPGRADE_WEIGHTS.activation)
    expect(signal.reasons).toEqual(['Leads a Circle or larger group', 'High activation propensity'])
  })

  it('flags a candidate once the blend clears the candidate score', () => {
    const signal = scoreUpgrade({
      ...BASE,
      communityRole: 'guide',
      activationPropensity: 80,
    })
    expect(signal.score).toBeGreaterThanOrEqual(UPGRADE_THRESHOLDS.candidateScore)
    expect(signal.isCandidate).toBe(true)
  })

  it('does not flag on a single weak signal', () => {
    // Engaged alone (15) is well below the candidate cut (55).
    const signal = scoreUpgrade({ ...BASE, wamStatus: true })
    expect(signal.score).toBe(UPGRADE_WEIGHTS.engaged)
    expect(signal.isCandidate).toBe(false)
  })

  it('treats weekly-active OR healthy as engaged (one reason, not two)', () => {
    const viaWam = scoreUpgrade({ ...BASE, wamStatus: true })
    const viaHealth = scoreUpgrade({ ...BASE, resonanceHealth: UPGRADE_THRESHOLDS.engagedHealth })
    expect(viaWam.reasons).toEqual(['Engaged this week'])
    expect(viaHealth.reasons).toEqual(['Engaged this week'])
    const both = scoreUpgrade({ ...BASE, wamStatus: true, resonanceHealth: 100 })
    expect(both.reasons.filter((r) => r === 'Engaged this week')).toHaveLength(1)
  })

  it('rewards a member who already runs a non-business Space', () => {
    const signal = scoreUpgrade({ ...BASE, spacesOwned: 1 })
    expect(signal.reasons).toContain('Already runs a Space')
    expect(signal.score).toBe(UPGRADE_WEIGHTS.ownsSpace)
  })

  it('clamps a maxed-out member to 100', () => {
    const signal = scoreUpgrade({
      ...BASE,
      communityRole: 'mentor',
      spacesOwned: 3,
      activationPropensity: 100,
      rfmScore: 100,
      resonanceHealth: 100,
      wamStatus: true,
    })
    expect(signal.score).toBe(100)
    expect(signal.isCandidate).toBe(true)
  })

  it('ignores traits below their thresholds', () => {
    const signal = scoreUpgrade({
      ...BASE,
      activationPropensity: UPGRADE_THRESHOLDS.highActivation - 1,
      rfmScore: UPGRADE_THRESHOLDS.strongRfm - 1,
      resonanceHealth: UPGRADE_THRESHOLDS.engagedHealth - 1,
    })
    expect(signal.score).toBe(0)
    expect(signal.reasons).toEqual([])
  })
})
