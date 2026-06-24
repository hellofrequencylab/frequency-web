import { describe, it, expect } from 'vitest'
import { rankTodayCandidates, resonanceScore, TODAY_CARD_CAP, type TodayCandidate } from './today'

const cand = (over: Partial<TodayCandidate> & { profileId: string }): TodayCandidate => ({
  churnRisk: 'low',
  activationPropensity: 50,
  nextBestAction: 'none',
  ...over,
})

describe('resonanceScore', () => {
  it('rises with churn risk, propensity, and next-best-action urgency', () => {
    const hot = resonanceScore(cand({ profileId: 'a', churnRisk: 'high', activationPropensity: 100, nextBestAction: 'reengage' }))
    const cool = resonanceScore(cand({ profileId: 'b', churnRisk: 'low', activationPropensity: 10, nextBestAction: 'deepen' }))
    expect(hot).toBeGreaterThan(cool)
  })

  it('a none-action scores zero (no concrete move)', () => {
    expect(resonanceScore(cand({ profileId: 'a', churnRisk: 'high', nextBestAction: 'none' }))).toBe(0)
  })

  it('propensity lifts but never zeroes a card (a 0-propensity card still scores)', () => {
    const s = resonanceScore(cand({ profileId: 'a', churnRisk: 'high', activationPropensity: 0, nextBestAction: 'reengage' }))
    expect(s).toBeGreaterThan(0)
  })
})

describe('rankTodayCandidates', () => {
  it('drops members with nothing to do (none + low risk)', () => {
    const r = rankTodayCandidates([
      cand({ profileId: 'a', churnRisk: 'low', nextBestAction: 'none' }),
      cand({ profileId: 'b', churnRisk: 'high', nextBestAction: 'reengage' }),
    ])
    expect(r.today.map((c) => c.profileId)).toEqual(['b'])
    expect(r.later).toHaveLength(0)
  })

  it('keeps a high-churn member even when the action is none (the churn playbook)', () => {
    const r = rankTodayCandidates([cand({ profileId: 'a', churnRisk: 'high', nextBestAction: 'none' })])
    expect(r.today).toHaveLength(1)
    // none + high churn -> the streak-save churn playbook fires.
    expect(r.today[0].playbook.id).toBe('churn_high_streak_save')
  })

  it('attaches the next_best_action playbook when a concrete move exists', () => {
    const r = rankTodayCandidates([cand({ profileId: 'a', churnRisk: 'high', nextBestAction: 'reengage' })])
    expect(r.today[0].playbook.id).toBe('reengage_winback')
  })

  it('sorts by score descending', () => {
    const r = rankTodayCandidates([
      cand({ profileId: 'low', churnRisk: 'low', activationPropensity: 10, nextBestAction: 'join_circle' }),
      cand({ profileId: 'high', churnRisk: 'high', activationPropensity: 100, nextBestAction: 'reengage' }),
      cand({ profileId: 'mid', churnRisk: 'medium', activationPropensity: 50, nextBestAction: 'activate' }),
    ])
    expect(r.today.map((c) => c.profileId)).toEqual(['high', 'mid', 'low'])
  })

  it('hard-caps Today at five; the overflow goes to Later', () => {
    const many: TodayCandidate[] = Array.from({ length: 9 }, (_, i) =>
      cand({ profileId: `p${i}`, churnRisk: 'high', activationPropensity: 100, nextBestAction: 'reengage' }),
    )
    const r = rankTodayCandidates(many)
    expect(r.today).toHaveLength(TODAY_CARD_CAP)
    expect(r.today).toHaveLength(5)
    expect(r.later).toHaveLength(4)
  })

  it('tie-breaks deterministically (equal score -> churn weight, then profileId)', () => {
    // Same score by construction; profileId breaks the tie ascending.
    const r = rankTodayCandidates([
      cand({ profileId: 'zeta', churnRisk: 'high', activationPropensity: 100, nextBestAction: 'reengage' }),
      cand({ profileId: 'alpha', churnRisk: 'high', activationPropensity: 100, nextBestAction: 'reengage' }),
    ])
    expect(r.today.map((c) => c.profileId)).toEqual(['alpha', 'zeta'])
  })

  it('an empty input yields empty today + later', () => {
    expect(rankTodayCandidates([])).toEqual({ today: [], later: [] })
  })
})
