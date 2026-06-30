import { describe, it, expect } from 'vitest'
import { resolvePlaybookForScores } from './resolve'

// The picker resolver MUST make the same choice as the Today ranker (a real move wins, else the churn
// tier, else nothing). These lock that contract + the fail-closed edges (a steady member, an unknown
// value, a no-op playbook) so the Space contact-detail picker never offers a play that cannot act.

describe('resolvePlaybookForScores', () => {
  it('a real next move wins (reengage -> the winback)', () => {
    const p = resolvePlaybookForScores({ churnRisk: 'low', nextBestAction: 'reengage' })
    expect(p?.id).toBe('reengage_winback')
  })

  it('a move wins over the churn tier (activate beats high churn)', () => {
    const p = resolvePlaybookForScores({ churnRisk: 'high', nextBestAction: 'activate' })
    expect(p?.id).toBe('activate_onboarding_nudge')
  })

  it('no move + high churn falls back to the in-product streak save', () => {
    const p = resolvePlaybookForScores({ churnRisk: 'high', nextBestAction: 'none' })
    expect(p?.id).toBe('churn_high_streak_save')
    expect(p?.autonomyTier).toBe('auto')
  })

  it('no move + medium churn falls back to the check-in', () => {
    const p = resolvePlaybookForScores({ churnRisk: 'medium', nextBestAction: 'none' })
    expect(p?.id).toBe('churn_medium_check_in')
  })

  it('a steady member (none + low) resolves to NOTHING (no card)', () => {
    expect(resolvePlaybookForScores({ churnRisk: 'low', nextBestAction: 'none' })).toBeNull()
  })

  it('a no-op playbook never surfaces (none + low churn has no actions)', () => {
    // churn_low_steady has zero actions; the resolver returns null rather than an empty play.
    expect(resolvePlaybookForScores({ churnRisk: 'low', nextBestAction: null })).toBeNull()
  })

  it('unknown / null values fail closed to nothing', () => {
    expect(resolvePlaybookForScores({ churnRisk: null, nextBestAction: null })).toBeNull()
    expect(resolvePlaybookForScores({ churnRisk: 'garbage', nextBestAction: 'nonsense' })).toBeNull()
  })

  it('only offers a playbook that can actually act (every result has at least one action)', () => {
    const moves = ['reengage', 'activate', 'join_circle', 'deepen', 'invite']
    for (const m of moves) {
      const p = resolvePlaybookForScores({ churnRisk: 'low', nextBestAction: m })
      expect(p, m).not.toBeNull()
      expect(p!.actions.length).toBeGreaterThan(0)
    }
  })
})
