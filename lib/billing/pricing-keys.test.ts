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
  memberNetworkTakeRateBps,
  memberTakeRateBps,
  memberTakeRateCents,
  monthlyTakeRateSavingsCents,
  memberCheckoutPriceKey,
  PERIODS_BY_KEY,
  networkTakeRateBpsForPlan,
  sourceAwareTakeRateCents,
  sourceAwareMemberTakeRateCents,
  NETWORK_TAKE_RATE_DEFAULT,
} from './pricing-keys'
import { SPACE_PLANS } from '@/lib/pricing/plans'

// A stored LEGACY flat `take_rate` blob (the retired ADR-552 paying-state ladder). Nothing on the charging
// path reads these fields any more — the live rates are the network vector + member_bps, exercised further
// down — but the flat helpers must still resolve a stored blob to a number, which is what this fixture is.
const TAKE_RATE = { free_bps: 500, business_bps: 300, nonprofit_bps: 300, member_bps: 800 }

describe('priceKey', () => {
  it('builds <base>_<period> and the founder variant', () => {
    expect(priceKey('crew', 'monthly')).toBe('crew_monthly')
    expect(priceKey('crew', 'annual')).toBe('crew_annual')
    expect(priceKey('business', 'monthly')).toBe('business_monthly')
    expect(priceKey('crew', 'monthly', true)).toBe('crew_monthly_founder')
  })
})

describe('offersPeriod', () => {
  it('crew/business/nonprofit offer monthly + annual (ADR-552, ADR-878)', () => {
    // Supporter is off the sellable ladder (ADR-878), so it is no longer a key with periods at all.
    for (const base of ['crew', 'business', 'nonprofit'] as const) {
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

  it('founder keys are personal-tier only (crew), monthly + annual', () => {
    const keys = allFounderPriceKeys()
    expect(keys).toContain('crew_monthly_founder')
    expect(keys).toContain('crew_annual_founder')
    // Supporter left the sellable ladder (ADR-878): the sync no longer MINTS its founder variants.
    // They stay RESOLVABLE via RETIRED_CATALOG_KEYS (asserted in pricing-catalog.test.ts).
    expect(keys.some((k) => k.startsWith('supporter'))).toBe(false)
    // no space plans get a founder variant
    expect(keys.some((k) => k.startsWith('business'))).toBe(false)
    expect(keys.every((k) => k.endsWith('_founder'))).toBe(true)
  })

  it('no public key sells Supporter (ADR-878)', () => {
    expect(allPublicPriceKeys().some((k) => k.startsWith('supporter'))).toBe(false)
  })

  it('PERIODS_BY_KEY: business + nonprofit both offer monthly + annual', () => {
    expect(PERIODS_BY_KEY.business).toEqual(['monthly', 'annual'])
    expect(PERIODS_BY_KEY.nonprofit).toEqual(['monthly', 'annual'])
    expect(PERIODS_BY_KEY.crew).toEqual(['monthly', 'annual'])
  })
})

describe('narrowing helpers (default-deny)', () => {
  it('asMemberTierKey accepts only crew; supporter is no longer a sellable key (ADR-878)', () => {
    expect(asMemberTierKey('crew')).toBe('crew')
    expect(asMemberTierKey('supporter')).toBeNull()
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

describe('member seller take-rate (ADR-596: paid member 8%, Business buys it down)', () => {
  it('memberTakeRateBps returns member_bps', () => {
    expect(memberTakeRateBps(TAKE_RATE)).toBe(800)
  })

  it('fails safe to the higher free_bps when member_bps is absent (never under-collect)', () => {
    expect(memberTakeRateBps({ free_bps: 500 })).toBe(500)
  })

  it('memberTakeRateCents applies 8% and floors fractional cents', () => {
    expect(memberTakeRateCents(10000, TAKE_RATE)).toBe(800) // $100 → $8
    expect(memberTakeRateCents(333, TAKE_RATE)).toBe(26) // 333*800/10000 = 26.64 → 26
  })

  it('is 0 for non-positive / invalid gross', () => {
    expect(memberTakeRateCents(0, TAKE_RATE)).toBe(0)
    expect(memberTakeRateCents(-100, TAKE_RATE)).toBe(0)
    expect(memberTakeRateCents(NaN, TAKE_RATE)).toBe(0)
  })

  it('a paid member pays more than a paying Business (the upgrade is real)', () => {
    expect(memberTakeRateBps(TAKE_RATE)).toBeGreaterThan(takeRateBpsForPlan('business', TAKE_RATE, true))
  })
})

describe('the individual seller rung — ONE Crew rate, no free-Member rung (ADR-913)', () => {
  it('resolves the Crew rate from the rate blob', () => {
    expect(memberNetworkTakeRateBps()).toBe(800) // the seeded 8%
    expect(memberNetworkTakeRateBps({ ...NETWORK_TAKE_RATE_DEFAULT, member: 600 })).toBe(600)
  })

  it('a partial operator blob with no `member` falls back to the seeded rate, never 0 and never NaN', () => {
    const partial = { ...NETWORK_TAKE_RATE_DEFAULT, member: undefined as unknown as number }
    expect(memberNetworkTakeRateBps(partial)).toBe(800)
  })

  it('carries NO free-Member rung: a free Member cannot sell, so there is no rate to read', () => {
    // The retired `member_free` field is gone from the shape, so no surface can resolve a free-member
    // seller rate. Asserted on the seeded default so re-adding the rung fails here first.
    expect(NETWORK_TAKE_RATE_DEFAULT).not.toHaveProperty('member_free')
  })

  it('sourceAwareMemberTakeRateCents charges the Crew rung on a network sale', () => {
    expect(sourceAwareMemberTakeRateCents(10000, 'network')).toBe(800) // $100 → $8
    expect(
      sourceAwareMemberTakeRateCents(10000, 'network', { ...NETWORK_TAKE_RATE_DEFAULT, member: 500 }),
    ).toBe(500)
  })

  it("a seller's OWN sale is still 0% (the hard promise)", () => {
    expect(sourceAwareMemberTakeRateCents(10000, 'self')).toBe(0)
    expect(sourceAwareMemberTakeRateCents(10000, 'self', NETWORK_TAKE_RATE_DEFAULT)).toBe(0)
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
    expect(memberCheckoutPriceKey({ base: 'crew', period: 'annual', isFoundingMember: true })).toBe(
      'crew_annual_founder',
    )
  })
})

// ── The differential (network-sourced) take-rate (Phase 2, ADR-811 §A) ───────────────────────────────
describe('differential take-rate: 0% on own bookings, tier-declining on network-sourced sales', () => {
  it('networkTakeRateBpsForPlan drops as the tier rises; legacy/unknown → free (never under-collect)', () => {
    expect(networkTakeRateBpsForPlan('free')).toBe(1000)
    expect(networkTakeRateBpsForPlan('business')).toBe(500)
    expect(networkTakeRateBpsForPlan('collective')).toBe(300)
    expect(networkTakeRateBpsForPlan('nonprofit')).toBe(0)
    expect(networkTakeRateBpsForPlan('independent')).toBe(0)
    // legacy labels narrow forward (whitelabel -> independent -> 0); unknown/null -> free (higher rate)
    expect(networkTakeRateBpsForPlan('whitelabel')).toBe(0)
    expect(networkTakeRateBpsForPlan('nonsense')).toBe(1000)
    expect(networkTakeRateBpsForPlan(null)).toBe(1000)
  })

  it('the network rate is monotonically non-increasing across the ladder', () => {
    const r = NETWORK_TAKE_RATE_DEFAULT
    expect(r.free).toBeGreaterThanOrEqual(r.business)
    expect(r.business).toBeGreaterThanOrEqual(r.collective)
    expect(r.collective).toBeGreaterThanOrEqual(r.nonprofit)
    expect(r.nonprofit).toBeGreaterThanOrEqual(r.independent)
  })

  it('sourceAwareTakeRateCents charges the tier network bps on a network sale', () => {
    expect(sourceAwareTakeRateCents(10000, 'business', 'network')).toBe(500) // 5% of $100
    expect(sourceAwareTakeRateCents(10000, 'collective', 'network')).toBe(300)
    expect(sourceAwareTakeRateCents(10000, 'free', 'network')).toBe(1000)
    expect(sourceAwareTakeRateCents(10000, 'nonprofit', 'network')).toBe(0)
    expect(sourceAwareTakeRateCents(10000, 'independent', 'network')).toBe(0)
    // floors fractional cents; invalid gross → 0
    expect(sourceAwareTakeRateCents(333, 'business', 'network')).toBe(16) // floor(333*500/10000)
    expect(sourceAwareTakeRateCents(0, 'business', 'network')).toBe(0)
    expect(sourceAwareTakeRateCents(-5, 'business', 'network')).toBe(0)
    expect(sourceAwareTakeRateCents(Number.NaN, 'business', 'network')).toBe(0)
  })

  it('sourceAwareMemberTakeRateCents charges the member (Crew) rate on a network sale', () => {
    expect(sourceAwareMemberTakeRateCents(10000, 'network')).toBe(800) // 8%
    expect(sourceAwareMemberTakeRateCents(0, 'network')).toBe(0)
  })

  it('ADVERSARIAL: a SELF order is NEVER billed a network rate, on any tier or gross', () => {
    const grosses = [1, 99, 100, 333, 10000, 250000, 9999999]
    for (const plan of SPACE_PLANS) {
      for (const g of grosses) {
        expect(sourceAwareTakeRateCents(g, plan, 'self')).toBe(0)
      }
    }
    for (const g of grosses) {
      expect(sourceAwareMemberTakeRateCents(g, 'self')).toBe(0)
    }
  })
})
