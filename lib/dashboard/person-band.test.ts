import { describe, it, expect } from 'vitest'
import { explainMemberScores } from './person-band'
import { deterministicContextLine } from './person-band'
import { NO_MEMBER_SCORES, type MemberScores } from './scores'

// The Person view score explainability (Resonance Engine Phase 3 · ADR-384). A bare score is never
// shown: explainMemberScores derives the top signals + a confidence band from the shared scores.
// deterministicContextLine (Phase 2) is covered here for the no-dashes + no-scores cases too.

const scores = (over: Partial<MemberScores> = {}): MemberScores => ({ ...NO_MEMBER_SCORES, ...over })

describe('explainMemberScores', () => {
  it('a high-churn, at-risk member leads with churn risk and reads high confidence', () => {
    const out = explainMemberScores(
      scores({ churnRisk: 'high', resonanceTier: 'at_risk', lifecycleStage: 'dormant', nextBestAction: 'reengage' }),
    )
    expect(out.signals[0]).toBe('high churn risk')
    expect(out.confidence).toBe('high')
    expect(out.signals.length).toBeLessThanOrEqual(3)
  })

  it('a barely-scored member reads low confidence', () => {
    const out = explainMemberScores(scores({ lifecycleStage: 'new' }))
    expect(out.confidence).toBe('low')
  })

  it('a healthy resonant member with low churn reads high confidence', () => {
    const out = explainMemberScores(
      scores({ churnRisk: 'low', resonanceTier: 'resonant', lifecycleStage: 'engaged', nextBestAction: 'none' }),
    )
    expect(out.confidence).toBe('high')
  })

  it('always returns at least one plain signal, no dashes', () => {
    const out = explainMemberScores(scores({ lifecycleStage: 'engaged', resonanceTier: 'cooling' }))
    expect(out.signals.length).toBeGreaterThan(0)
    for (const s of out.signals) expect(s).not.toMatch(/[–—]/)
  })

  it('is deterministic', () => {
    const s = scores({ churnRisk: 'medium', resonanceTier: 'cooling', lifecycleStage: 'at_risk', nextBestAction: 'deepen' })
    expect(explainMemberScores(s)).toEqual(explainMemberScores(s))
  })
})

describe('deterministicContextLine (Phase 2, no-dashes guard)', () => {
  it('says "not scored yet" plainly when there is no standing', () => {
    expect(deterministicContextLine('Maya', NO_MEMBER_SCORES)).toContain('not been scored yet')
  })

  it('never uses an em or en dash', () => {
    const line = deterministicContextLine('Maya', scores({ lifecycleStage: 'engaged', resonanceTier: 'resonant', nextBestAction: 'invite' }))
    expect(line).not.toMatch(/[–—]/)
  })
})
