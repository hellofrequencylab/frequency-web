import { describe, it, expect } from 'vitest'
import {
  connectorReward,
  isRealConnection,
  outcomeIsRealConnection,
  connectorTier,
  connectorRuleKey,
  CONNECTOR_REWARDS,
  CONNECTOR_TIERS,
} from './connector'

// The PURE connector-reward economy (ADR-154 / ADR-777). Locks the outcome→payout table, the
// "real connection" predicate, the achievement tiers, and the idempotency key shape — the parts the
// grant engine relies on to reward the OUTCOME (never the bare capture) and never double-pay.

describe('connectorReward', () => {
  it('pays ascending by realness; only join carries a gem bonus', () => {
    expect(connectorReward('capture')).toEqual({ zaps: 2, gems: 0 })
    expect(connectorReward('rsvp')).toEqual({ zaps: 4, gems: 0 })
    expect(connectorReward('attend')).toEqual({ zaps: 8, gems: 0 })
    expect(connectorReward('join')).toEqual({ zaps: 8, gems: 5 })
  })

  it('is zero for an unknown outcome (fail-safe)', () => {
    // @ts-expect-error — exercising the runtime guard with an off-table value
    expect(connectorReward('nope')).toEqual({ zaps: 0, gems: 0 })
  })

  it('every table entry pays at least something', () => {
    for (const r of Object.values(CONNECTOR_REWARDS)) {
      expect(r.zaps + r.gems).toBeGreaterThan(0)
    }
  })
})

describe('isRealConnection', () => {
  it('counts a going/maybe RSVP or a join, not a decline or a bare capture', () => {
    expect(isRealConnection({ rsvpStatus: 'going' })).toBe(true)
    expect(isRealConnection({ rsvpStatus: 'maybe' })).toBe(true)
    expect(isRealConnection({ joined: true })).toBe(true)
    expect(isRealConnection({ joined: true, rsvpStatus: 'declined' })).toBe(true)
    expect(isRealConnection({ rsvpStatus: 'declined' })).toBe(false)
    expect(isRealConnection({ rsvpStatus: null })).toBe(false)
    expect(isRealConnection({})).toBe(false)
  })
})

describe('outcomeIsRealConnection', () => {
  it('advances the achievement for rsvp/attend/join, never a bare capture', () => {
    expect(outcomeIsRealConnection('capture')).toBe(false)
    expect(outcomeIsRealConnection('rsvp')).toBe(true)
    expect(outcomeIsRealConnection('attend')).toBe(true)
    expect(outcomeIsRealConnection('join')).toBe(true)
  })
})

describe('connectorTier', () => {
  it('returns the highest tier reached, or null below the first threshold', () => {
    expect(connectorTier(0)).toBeNull()
    expect(connectorTier(9)).toBeNull()
    expect(connectorTier(10)?.slug).toBe('connector-10')
    expect(connectorTier(24)?.slug).toBe('connector-10')
    expect(connectorTier(25)?.slug).toBe('connector-25')
    expect(connectorTier(999)?.slug).toBe('connector-100')
  })

  it('thresholds are strictly ascending (so "highest reached" is well-defined)', () => {
    for (let i = 1; i < CONNECTOR_TIERS.length; i++) {
      expect(CONNECTOR_TIERS[i].threshold).toBeGreaterThan(CONNECTOR_TIERS[i - 1].threshold)
    }
  })
})

describe('connectorRuleKey', () => {
  it('is deterministic per (outcome, inviter, guest) — the once-per-outcome idempotency lock', () => {
    expect(connectorRuleKey('attend', 'inv1', 'g1')).toBe('connector:attend:inv1:g1')
    // Different outcome / inviter / guest → different key (each pays at most once).
    expect(connectorRuleKey('join', 'inv1', 'g1')).not.toBe(connectorRuleKey('attend', 'inv1', 'g1'))
    expect(connectorRuleKey('attend', 'inv2', 'g1')).not.toBe(connectorRuleKey('attend', 'inv1', 'g1'))
  })
})
