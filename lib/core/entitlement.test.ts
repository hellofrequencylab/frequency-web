import { describe, it, expect } from 'vitest'
import { deriveTier, isPaid, canCashIn } from '@/lib/core/entitlement'
import { accessTo } from '@/lib/core/access-matrix'

describe('deriveTier', () => {
  it('returns the billing flag, defaulting to free', () => {
    expect(deriveTier('free')).toBe('free')
    expect(deriveTier('crew')).toBe('crew')
    expect(deriveTier('supporter')).toBe('supporter')
    expect(deriveTier(null)).toBe('free')
    expect(deriveTier(undefined)).toBe('free')
  })
})

describe('isPaid', () => {
  it('Crew and Supporter are paid; free is not', () => {
    expect(isPaid('free')).toBe(false)
    expect(isPaid('crew')).toBe(true)
    expect(isPaid('supporter')).toBe(true)
    expect(isPaid(null)).toBe(false)
  })
})

describe('canCashIn — the Vault cash-in (spend/claim) gate (P2.6, ADR-225)', () => {
  it('only the paid tiers can cash in; free accrues but cannot spend', () => {
    expect(canCashIn('free')).toBe(false)
    expect(canCashIn('crew')).toBe(true)
    expect(canCashIn('supporter')).toBe(true)
    expect(canCashIn(null)).toBe(false)
    expect(canCashIn(undefined)).toBe(false)
  })

  it('is the TIER predicate — never a function of the community role (ADR-207)', () => {
    // A free-tier Host is a steward, not "paid"; they cannot cash in via their role.
    // canCashIn sees only the tier, so the decoupling holds by construction.
    expect(canCashIn('free')).toBe(false)
  })

  it('agrees with the Vault matrix gate (both are isPaid(tier))', () => {
    for (const tier of ['free', 'crew', 'supporter'] as const) {
      const matrixFull = accessTo('vault', { loggedIn: true, role: 'member', tier }) === 'full'
      expect(canCashIn(tier)).toBe(matrixFull)
    }
  })
})

describe('entitlement feeds the access matrix (the ✋ gate tracks the tier)', () => {
  it('free member is gated on the Vault; Crew unlocks it', () => {
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'free' })).toBe('limited')
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'crew' })).toBe('full')
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'supporter' })).toBe('full')
  })
})
