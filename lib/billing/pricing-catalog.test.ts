import { describe, it, expect } from 'vitest'

// Pricing ladder Phase B (ADR-460), the PURE catalog math (no IO / no Stripe): the clean catalog
// shape (Pro base + four add-ons + nonprofit seat + organization), the list-vs-founding split, the
// monthly-vs-yearly (two months free = 10x) derivation, the price-key namespace, and the add-on
// item bridge. The IO sync (pricing-products.ts) is exercised behind billingEnabled().

import {
  CATALOG_ITEM_KEYS,
  BILLING_INTERVALS,
  asCatalogItemKey,
  catalogItem,
  catalogItems,
  catalogAmounts,
  catalogPriceKey,
  allCatalogPriceKeys,
  yearlyFromMonthly,
  addonKeyForCatalogItem,
  RETIRED_CATALOG_KEYS,
} from './pricing-keys'

describe('yearlyFromMonthly (two months free)', () => {
  it('is exactly 10x the monthly amount', () => {
    expect(yearlyFromMonthly(1900)).toBe(19000) // $19/mo -> $190/yr
    expect(yearlyFromMonthly(2900)).toBe(29000) // $29/mo -> $290/yr
    expect(yearlyFromMonthly(900)).toBe(9000) // $9 seat -> $90/yr
  })

  it('is 0 for non-positive / invalid input', () => {
    expect(yearlyFromMonthly(0)).toBe(0)
    expect(yearlyFromMonthly(-100)).toBe(0)
    expect(yearlyFromMonthly(NaN)).toBe(0)
  })
})

describe('the clean catalog shape (collapsed · ADR-552)', () => {
  it('holds exactly the three items (Business base, AI add-on, nonprofit seat)', () => {
    expect([...CATALOG_ITEM_KEYS]).toEqual([
      'business_base',
      'addon_ai',
      'nonprofit_seat',
    ])
    expect(catalogItems()).toHaveLength(3)
  })

  it('Business base: $49 base, the full-depth paid tier, not per seat', () => {
    const biz = catalogItem('business_base')
    expect(biz.month.foundingCents).toBe(4900)
    expect(biz.month.listCents).toBe(7900) // $79 founding anchor over the $49 charged price (ADR-591)
    expect(biz.perSeat).toBe(false)
  })

  it('every item has a founding <= list amount on both intervals', () => {
    for (const item of catalogItems()) {
      for (const interval of BILLING_INTERVALS) {
        const a = catalogAmounts(item.key, interval)
        expect(a.foundingCents).toBeGreaterThan(0)
        expect(a.listCents).toBeGreaterThanOrEqual(a.foundingCents)
      }
    }
  })

  it('every item yearly = 10x its monthly (two months free), for BOTH list and founding', () => {
    for (const item of catalogItems()) {
      expect(item.year.listCents).toBe(item.month.listCents * 10)
      expect(item.year.foundingCents).toBe(item.month.foundingCents * 10)
    }
  })

  it('Nonprofit: $29/mo FLAT, never per seat (ADR-590)', () => {
    const np = catalogItem('nonprofit_seat')
    expect(np.month.listCents).toBe(2900)
    expect(np.month.foundingCents).toBe(2900)
    expect(np.perSeat).toBe(false)
  })

  it('no catalog item is per-seat (flat pricing, ADR-590)', () => {
    expect(catalogItem('addon_ai').perSeat).toBe(false)
    expect(catalogItem('business_base').perSeat).toBe(false)
    expect(catalogItem('nonprofit_seat').perSeat).toBe(false)
  })
})

describe('catalog price keys', () => {
  it('the founding (charged) key is <item>_<interval>; the list anchor adds _list', () => {
    expect(catalogPriceKey('business_base', 'month')).toBe('business_base_month')
    expect(catalogPriceKey('business_base', 'year')).toBe('business_base_year')
    expect(catalogPriceKey('business_base', 'month', true)).toBe('business_base_month_list')
    expect(catalogPriceKey('business_base', 'year', true)).toBe('business_base_year_list')
  })

  it('allCatalogPriceKeys = 3 items x 2 intervals x 2 variants = 12 keys', () => {
    const keys = allCatalogPriceKeys()
    expect(keys).toHaveLength(12)
    expect(keys).toContain('business_base_month')
    expect(keys).toContain('business_base_month_list')
    expect(keys).toContain('addon_ai_month')
    expect(keys).toContain('nonprofit_seat_year')
    // the retired items are NOT in the live catalog
    expect(keys).not.toContain('pro_base_month')
    expect(keys).not.toContain('organization_month_list')
    // every key is unique
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('add-on item bridge + narrowing (collapsed · ADR-552)', () => {
  it('maps addon_ai to the sole entitlement add-on key; tier items map to null', () => {
    expect(addonKeyForCatalogItem('addon_ai')).toBe('ai')
    expect(addonKeyForCatalogItem('business_base')).toBeNull()
    expect(addonKeyForCatalogItem('nonprofit_seat')).toBeNull()
  })

  it('asCatalogItemKey is default-deny (the retired items no longer narrow)', () => {
    expect(asCatalogItemKey('business_base')).toBe('business_base')
    expect(asCatalogItemKey('addon_ai')).toBe('addon_ai')
    expect(asCatalogItemKey('pro_base')).toBeNull() // retired (ADR-552)
    expect(asCatalogItemKey('organization')).toBeNull() // retired (ADR-552)
    expect(asCatalogItemKey('addon_marketing')).toBeNull() // retired (ADR-472)
    expect(asCatalogItemKey('nonsense')).toBeNull()
    expect(asCatalogItemKey(null)).toBeNull()
  })
})

describe('retired legacy keys (kept resolvable, never deleted)', () => {
  it('covers the retired tiers + the retired catalog items, and excludes the live catalog', () => {
    // Pre-ladder + collapsed per-plan tiers (ADR-552).
    expect(RETIRED_CATALOG_KEYS).toContain('practitioner_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('organization_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('whitelabel_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly_founder')
    // The retired CATALOG items: Pro base + Organization (ADR-552), Marketing/Team/Branding (ADR-472).
    expect(RETIRED_CATALOG_KEYS).toContain('pro_base_month')
    expect(RETIRED_CATALOG_KEYS).toContain('pro_base_year_list')
    expect(RETIRED_CATALOG_KEYS).toContain('organization_month')
    expect(RETIRED_CATALOG_KEYS).toContain('addon_marketing_month')
    expect(RETIRED_CATALOG_KEYS).toContain('addon_marketing_year_list')
    expect(RETIRED_CATALOG_KEYS).toContain('addon_team_month')
    expect(RETIRED_CATALOG_KEYS).toContain('addon_branding_year')
    // none of the LIVE catalog keys are in the retired set (addon_ai stays live)
    for (const k of allCatalogPriceKeys()) {
      expect(RETIRED_CATALOG_KEYS).not.toContain(k)
    }
  })
})
