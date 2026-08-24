import { describe, it, expect } from 'vitest'
import { deriveTier, isPaid, canCashIn, ENTITLEMENT_TIERS, ENTITLEMENT_LABEL } from '@/lib/core/entitlement'
import { accessTo } from '@/lib/core/access-matrix'

// THE ENTITLEMENT LADDER HAS EXACTLY TWO RUNGS: Member (free) and Crew (paid).
//
// The Supporter rung was retired on 2026-08-24 (owner directive closing the ADR-458 drop condition,
// on top of ADR-878 which had already taken it off the sellable ladder). It left the EntitlementTier
// union, ENTITLEMENT_TIERS, ENTITLEMENT_LABEL and the isPaid matrix, and the read-time
// `supporter -> crew` fold in deriveTier went with it.
//
// The fold was safe to remove because its drop condition was MEASURED, not assumed: migration
// 20260915000100 narrowed profiles.membership_tier to CHECK (membership_tier in ('free','crew')) and
// remapped every row, and the live column carries zero of the retired label across 56 profiles.
//
// SEPARATE THING, DELIBERATELY UNTOUCHED: the Supporter BADGE (profiles.is_supporter), the
// pay-what-you-want contribution mark. lib/billing/supporter.test.ts covers it. Retiring a rung is
// not retiring a way to give.

describe('deriveTier', () => {
  it('returns the billing flag, defaulting to free', () => {
    expect(deriveTier('free')).toBe('free')
    expect(deriveTier('crew')).toBe('crew')
    expect(deriveTier(null)).toBe('free')
    expect(deriveTier(undefined)).toBe('free')
  })

})

describe('the ladder is exactly two rungs (Supporter retired, 2026-08-24)', () => {
  it('ENTITLEMENT_TIERS is [free, crew], in ascending order', () => {
    expect([...ENTITLEMENT_TIERS]).toEqual(['free', 'crew'])
  })

  it('ENTITLEMENT_LABEL carries a label for each rung and nothing else', () => {
    expect(Object.keys(ENTITLEMENT_LABEL).sort()).toEqual(['crew', 'free'])
    expect(ENTITLEMENT_LABEL).not.toHaveProperty('supporter')
    // No surface can render the retired name off this map.
    expect(Object.values(ENTITLEMENT_LABEL)).not.toContain('Supporter')
  })

  it('the retired label is no longer a rung anywhere on the ladder', () => {
    // A string cast, because it is not representable through the type any more — which is the
    // point: the compiler is the first gate and this is the second.
    const retired = 'supporter' as unknown as 'free'
    expect(ENTITLEMENT_TIERS).not.toContain(retired)
    expect(isPaid(retired)).toBe(false)
    expect(canCashIn(retired)).toBe(false)
  })
})

describe('isPaid', () => {
  it('Crew is the one paid rung; free is not', () => {
    expect(isPaid('free')).toBe(false)
    expect(isPaid('crew')).toBe(true)
    expect(isPaid(null)).toBe(false)
    expect(isPaid(undefined)).toBe(false)
  })
})

describe('canCashIn — the Vault cash-in (spend/claim) gate (P2.6, ADR-226)', () => {
  it('only the paid tier can cash in; free accrues but cannot spend', () => {
    expect(canCashIn('free')).toBe(false)
    expect(canCashIn('crew')).toBe(true)
    expect(canCashIn(null)).toBe(false)
    expect(canCashIn(undefined)).toBe(false)
  })

  it('is the TIER predicate — never a function of the community role (ADR-207)', () => {
    // A free-tier Host is a steward, not "paid"; they cannot cash in via their role.
    // canCashIn sees only the tier, so the decoupling holds by construction.
    expect(canCashIn('free')).toBe(false)
  })

  it('agrees with the Vault matrix gate (both are isPaid(tier))', () => {
    for (const tier of ENTITLEMENT_TIERS) {
      const matrixFull = accessTo('vault', { loggedIn: true, role: 'member', tier }) === 'full'
      expect(canCashIn(tier)).toBe(matrixFull)
    }
  })
})

describe('entitlement feeds the access matrix (the ✋ gate tracks the tier)', () => {
  it('free member is gated on the Vault; Crew unlocks it', () => {
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'free' })).toBe('limited')
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'crew' })).toBe('full')
  })
})
