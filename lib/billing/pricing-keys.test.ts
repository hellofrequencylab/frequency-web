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
  monthlyTakeRateSavingsCents,
  memberCheckoutPriceKey,
  PERIODS_BY_KEY,
} from './pricing-keys'

// ADR-552 Phase 3: free usage 5% (500 bps) / paying Business 3% (300) / Non Profit 3% (300).
const TAKE_RATE = { free_bps: 500, business_bps: 300, nonprofit_bps: 300 }

describe('priceKey', () => {
  it('builds <base>_<period> and the founder variant', () => {
    expect(priceKey('crew', 'monthly')).toBe('crew_monthly')
    expect(priceKey('crew', 'annual')).toBe('crew_annual')
    expect(priceKey('business', 'monthly')).toBe('business_monthly')
    expect(priceKey('crew', 'monthly', true)).toBe('crew_monthly_founder')
  })
})

describe('offersPeriod', () => {
  it('crew/supporter/business/nonprofit offer monthly + annual (ADR-552)', () => {
    for (const base of ['crew', 'supporter', 'business', 'nonprofit'] as const) {
      expect(offersPeriod(base, 'monthly')).toBe(true)
      expect(offersPeriod(base, 'annual')).toBe(true)
    }
  })
})

describe('the key catalog', () => {
  it('public keys cover every offered period for the sold tiers (business + nonprofit)', () => {
    const keys = allPublicPriceKeys()
    expect(keys).toContain('crew_monthly')
    expect(keys).toContain('crew_annual')
    expect(keys).toContain('business_monthly')
    expect(keys).toContain('business_annual')
    // nonprofit is sold with both periods; the retired tiers are never in the public catalog
    expect(keys).toContain('nonprofit_monthly')
    expect(keys).toContain('nonprofit_annual')
    expect(keys.some((k) => k.startsWith('practitioner'))).toBe(false)
    expect(keys.some((k) => k.startsWith('organization'))).toBe(false)
    expect(keys.some((k) => k.startsWith('whitelabel'))).toBe(false)
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
    expect(keys.some((k) => k.startsWith('business'))).toBe(false)
    expect(keys.every((k) => k.endsWith('_founder'))).toBe(true)
  })

  it('PERIODS_BY_KEY: business + nonprofit both offer monthly + annual', () => {
    expect(PERIODS_BY_KEY.business).toEqual(['monthly', 'annual'])
    expect(PERIODS_BY_KEY.nonprofit).toEqual(['monthly', 'annual'])
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

  it('asSpacePlanKey accepts only the sold plans (business/nonprofit); retired names are null', () => {
    expect(asSpacePlanKey('business')).toBe('business')
    expect(asSpacePlanKey('nonprofit')).toBe('nonprofit')
    // Retired tier names are no longer sold keys → null (default-deny).
    expect(asSpacePlanKey('practitioner')).toBeNull()
    expect(asSpacePlanKey('organization')).toBeNull()
    expect(asSpacePlanKey('whitelabel')).toBeNull()
    expect(asSpacePlanKey('free')).toBeNull()
    expect(asSpacePlanKey(null)).toBeNull()
    expect(asSpacePlanKey('nonsense')).toBeNull()
  })
})

describe('take-rate by paying-state (ADR-552: free usage 5% / paying Business 3% / Non Profit 3%)', () => {
  it('a Business pays the lower rate only when it has a live paid subscription (isPaying)', () => {
    // Free-vs-paid is a usage state WITHIN Business, so the same plan label resolves two rates.
    expect(takeRateBpsForPlan('business', TAKE_RATE, true)).toBe(300) // paying → 3%
    expect(takeRateBpsForPlan('business', TAKE_RATE, false)).toBe(500) // free usage → 5%
    expect(takeRateBpsForPlan('business', TAKE_RATE)).toBe(500) // isPaying defaults false → the free rate
  })

  it('Non Profit always pays its rate (a verified 501c3 is inherently paid)', () => {
    expect(takeRateBpsForPlan('nonprofit', TAKE_RATE, true)).toBe(300)
    expect(takeRateBpsForPlan('nonprofit', TAKE_RATE, false)).toBe(300)
  })

  it('a free/legacy/unknown plan pays the higher free rate, never 0 (never under-collect)', () => {
    expect(takeRateBpsForPlan('free', TAKE_RATE)).toBe(500)
    expect(takeRateBpsForPlan('practitioner', TAKE_RATE)).toBe(500) // retired label → free rate
    expect(takeRateBpsForPlan(null, TAKE_RATE)).toBe(500)
    expect(takeRateBpsForPlan('nonsense', TAKE_RATE)).toBe(500)
  })

  it('takeRateCents applies the rate for the paying-state and floors fractional cents', () => {
    // $100 free usage @ 5% = $5.00; paying Business @ 3% = $3.00
    expect(takeRateCents(10000, 'business', TAKE_RATE, false)).toBe(500)
    expect(takeRateCents(10000, 'business', TAKE_RATE, true)).toBe(300)
    // $100 @ 3% Non Profit = $3.00
    expect(takeRateCents(10000, 'nonprofit', TAKE_RATE)).toBe(300)
    // 333c @ 5% (free usage) = 16.65 → floor 16
    expect(takeRateCents(333, 'business', TAKE_RATE, false)).toBe(16)
  })

  it('takeRateCents is 0 for non-positive / invalid gross', () => {
    expect(takeRateCents(0, 'business', TAKE_RATE)).toBe(0)
    expect(takeRateCents(-100, 'business', TAKE_RATE)).toBe(0)
    expect(takeRateCents(NaN, 'business', TAKE_RATE)).toBe(0)
  })
})

describe('the "you\'d have saved $X" nudge (monthlyTakeRateSavingsCents)', () => {
  it('applies the bps delta (free minus paid) to the trailing volume, floored', () => {
    // $1,000 processed × (500 - 300) bps = 2% = $20.00
    expect(monthlyTakeRateSavingsCents(100000, TAKE_RATE)).toBe(2000)
    // 333c × 2% = 6.66 → floor 6
    expect(monthlyTakeRateSavingsCents(333, TAKE_RATE)).toBe(6)
  })

  it('is 0 when the volume or the delta is non-positive (only a real saving shows)', () => {
    expect(monthlyTakeRateSavingsCents(0, TAKE_RATE)).toBe(0)
    expect(monthlyTakeRateSavingsCents(-100, TAKE_RATE)).toBe(0)
    expect(monthlyTakeRateSavingsCents(NaN, TAKE_RATE)).toBe(0)
    // No delta (free == paid) → no saving to advertise.
    expect(monthlyTakeRateSavingsCents(100000, { free_bps: 300, business_bps: 300 })).toBe(0)
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
