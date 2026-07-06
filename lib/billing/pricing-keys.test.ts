import { describe, it, expect } from 'vitest'

// Pricing P2 (ADR-363) — the PURE price-key + take-rate + founder-lock logic (no IO / no Stripe).
// These are the halves the gated checkout + sync rely on; the IO readers/writers are exercised at
// their call sites behind billingEnabled()/billingLive().

import {
  priceKey,
  offersPeriod,
  allPublicPriceKeys,
  allFounderPriceKeys,
  asMemberTierKey,
  asSpacePlanKey,
  takeRateBpsForPlan,
  takeRateCents,
  memberCheckoutPriceKey,
  PERIODS_BY_KEY,
} from './pricing-keys'

const TAKE_RATE = { free_bps: 500, practitioner_bps: 0, business_bps: 0, organization_bps: 0 }

describe('priceKey', () => {
  it('builds <base>_<period> and the founder variant', () => {
    expect(priceKey('crew', 'monthly')).toBe('crew_monthly')
    expect(priceKey('crew', 'annual')).toBe('crew_annual')
    expect(priceKey('practitioner', 'monthly')).toBe('practitioner_monthly')
    expect(priceKey('crew', 'monthly', true)).toBe('crew_monthly_founder')
  })
})

describe('offersPeriod', () => {
  it('crew/supporter/practitioner/business offer monthly + annual', () => {
    for (const base of ['crew', 'supporter', 'practitioner', 'business'] as const) {
      expect(offersPeriod(base, 'monthly')).toBe(true)
      expect(offersPeriod(base, 'annual')).toBe(true)
    }
  })

  it('organization + whitelabel are monthly-only', () => {
    expect(offersPeriod('organization', 'monthly')).toBe(true)
    expect(offersPeriod('organization', 'annual')).toBe(false)
    expect(offersPeriod('whitelabel', 'monthly')).toBe(true)
    expect(offersPeriod('whitelabel', 'annual')).toBe(false)
  })

  it('nonprofit offers monthly + annual (it is sold, with a discounted annual line)', () => {
    expect(offersPeriod('nonprofit', 'monthly')).toBe(true)
    expect(offersPeriod('nonprofit', 'annual')).toBe(true)
  })
})

describe('the key catalog', () => {
  it('public keys cover every offered period and exclude monthly-only annuals', () => {
    const keys = allPublicPriceKeys()
    expect(keys).toContain('crew_monthly')
    expect(keys).toContain('crew_annual')
    expect(keys).toContain('organization_monthly')
    expect(keys).not.toContain('organization_annual')
    expect(keys).not.toContain('whitelabel_annual')
    // nonprofit is sold with both periods; partner is comped and never in the public catalog
    expect(keys).toContain('nonprofit_monthly')
    expect(keys).toContain('nonprofit_annual')
    expect(keys.some((k) => k.startsWith('partner'))).toBe(false)
    // no founder variants in the public list
    expect(keys.every((k) => !k.endsWith('_founder'))).toBe(true)
  })

  it('founder keys are personal-tier only (crew/supporter), monthly + annual', () => {
    const keys = allFounderPriceKeys()
    expect(keys).toContain('crew_monthly_founder')
    expect(keys).toContain('crew_annual_founder')
    expect(keys).toContain('supporter_monthly_founder')
    // no space plans get a founder variant
    expect(keys.some((k) => k.startsWith('practitioner'))).toBe(false)
    expect(keys.every((k) => k.endsWith('_founder'))).toBe(true)
  })

  it('PERIODS_BY_KEY matches the seeded defaults shape (org/whitelabel monthly only)', () => {
    expect(PERIODS_BY_KEY.organization).toEqual(['monthly'])
    expect(PERIODS_BY_KEY.whitelabel).toEqual(['monthly'])
    expect(PERIODS_BY_KEY.crew).toEqual(['monthly', 'annual'])
  })
})

describe('narrowing helpers (default-deny)', () => {
  it('asMemberTierKey accepts only crew/supporter', () => {
    expect(asMemberTierKey('crew')).toBe('crew')
    expect(asMemberTierKey('supporter')).toBe('supporter')
    expect(asMemberTierKey('free')).toBeNull()
    expect(asMemberTierKey(null)).toBeNull()
    expect(asMemberTierKey('nonsense')).toBeNull()
  })

  it('asSpacePlanKey accepts only the paid plans', () => {
    expect(asSpacePlanKey('practitioner')).toBe('practitioner')
    expect(asSpacePlanKey('whitelabel')).toBe('whitelabel')
    expect(asSpacePlanKey('free')).toBeNull()
    expect(asSpacePlanKey(null)).toBeNull()
    expect(asSpacePlanKey('nonsense')).toBeNull()
  })

  it('nonprofit is SOLD (a paid key); partner is comped, so it is NOT a paid key', () => {
    // Nonprofit is sold self-serve to verified mission orgs → a real price key.
    expect(asSpacePlanKey('nonprofit')).toBe('nonprofit')
    // Partner is comped / operator-assigned (full-featured but never sold) → null (default-deny).
    expect(asSpacePlanKey('partner')).toBeNull()
  })
})

describe('take-rate by plan (connection-based: Free 5%, every paid plan 0%)', () => {
  it('every PAID plan is 0%', () => {
    for (const p of ['practitioner', 'business', 'brand', 'nonprofit', 'partner', 'organization', 'whitelabel']) {
      expect(takeRateBpsForPlan(p, TAKE_RATE)).toBe(0)
    }
  })

  it('the Free plan pays the free rate (5%)', () => {
    expect(takeRateBpsForPlan('free', TAKE_RATE)).toBe(500)
  })

  it('an unknown / profile-owned ("maker") seller pays the Free rate, never a paid 0', () => {
    expect(takeRateBpsForPlan(null, TAKE_RATE)).toBe(500)
    expect(takeRateBpsForPlan('nonsense', TAKE_RATE)).toBe(500)
    expect(takeRateBpsForPlan('maker', TAKE_RATE)).toBe(500)
  })

  it('falls back to the 5% default when free_bps is absent from config', () => {
    expect(takeRateBpsForPlan('free', {})).toBe(500)
  })

  it('takeRateCents applies the rate and floors fractional cents', () => {
    // $100 @ 5% (Free) = $5.00
    expect(takeRateCents(10000, 'free', TAKE_RATE)).toBe(500)
    // A paid plan takes nothing
    expect(takeRateCents(10000, 'business', TAKE_RATE)).toBe(0)
    // 333c @ 5% = 16.65 → floor 16 (Free)
    expect(takeRateCents(333, 'free', TAKE_RATE)).toBe(16)
  })

  it('takeRateCents is 0 for non-positive / invalid gross', () => {
    expect(takeRateCents(0, 'practitioner', TAKE_RATE)).toBe(0)
    expect(takeRateCents(-100, 'practitioner', TAKE_RATE)).toBe(0)
    expect(takeRateCents(NaN, 'practitioner', TAKE_RATE)).toBe(0)
  })
})

describe('founder-lock price-key selection', () => {
  it('a non-founder gets the public key', () => {
    expect(memberCheckoutPriceKey({ base: 'crew', period: 'monthly', isFoundingMember: false })).toBe('crew_monthly')
  })

  it('a founding member gets the founder variant when the period is offered', () => {
    expect(memberCheckoutPriceKey({ base: 'crew', period: 'monthly', isFoundingMember: true })).toBe(
      'crew_monthly_founder',
    )
    expect(memberCheckoutPriceKey({ base: 'supporter', period: 'annual', isFoundingMember: true })).toBe(
      'supporter_annual_founder',
    )
  })
})
