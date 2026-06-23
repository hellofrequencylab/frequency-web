import { describe, it, expect } from 'vitest'
import { computeScores } from './compute'
import { weightFor } from './weights'

describe('trust score computation (ADR-247)', () => {
  it('rolls every signal into global and scopes per-context', () => {
    const { global, byContext } = computeScores([
      { source: 'verification', signalType: 'id_verified', context: 'global' }, // +25 global
      { source: 'marketplace', signalType: 'deal_completed', context: 'marketplace' }, // +6 global +6 marketplace
      { source: 'marketplace', signalType: 'deal_completed', context: 'marketplace' }, // +6 / +6
    ])
    expect(global).toBe(25 + 6 + 6)
    expect(byContext.marketplace).toBe(12)
  })

  it('applies penalties and floors a score at 0 (never negative)', () => {
    const { global, byContext } = computeScores([
      { source: 'marketplace', signalType: 'deal_completed', context: 'marketplace' }, // +6
      { source: 'marketplace', signalType: 'dispute_lost', context: 'marketplace' }, // -15
    ])
    // marketplace: 6 - 15 = -9 → floored to 0; global likewise.
    expect(byContext.marketplace).toBe(0)
    expect(global).toBe(0)
  })

  it('is a pure replay — same signals always yield the same rows', () => {
    const signals = [{ source: 'community', signalType: 'endorsement_received', context: 'community' }]
    expect(computeScores(signals)).toEqual(computeScores(signals))
  })

  it('unknown signals weigh 0 (no silent scoring)', () => {
    expect(weightFor('marketplace', 'not_a_signal')).toBe(0)
    expect(weightFor('marketplace', 'deal_completed')).toBe(6)
    const { global } = computeScores([{ source: 'x', signalType: 'y', context: 'global' }])
    expect(global).toBe(0)
  })
})
