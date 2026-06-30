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

describe('the clean catalog shape', () => {
  it('holds exactly the seven Phase B items', () => {
    expect([...CATALOG_ITEM_KEYS]).toEqual([
      'pro_base',
      'addon_marketing',
      'addon_ai',
      'addon_team',
      'addon_branding',
      'nonprofit_seat',
      'organization',
    ])
    expect(catalogItems()).toHaveLength(7)
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

  it('Pro base: $29 list / $19 founding monthly (the headline anchor)', () => {
    const pro = catalogItem('pro_base')
    expect(pro.month.listCents).toBe(2900)
    expect(pro.month.foundingCents).toBe(1900)
    expect(pro.year.listCents).toBe(29000)
    expect(pro.year.foundingCents).toBe(19000)
    expect(pro.perSeat).toBe(false)
  })

  it('Nonprofit seat: $15 list / $12 founding per seat, marked perSeat', () => {
    const np = catalogItem('nonprofit_seat')
    expect(np.month.listCents).toBe(1500)
    expect(np.month.foundingCents).toBe(1200)
    expect(np.perSeat).toBe(true)
  })

  it('Team add-on is the per-seat add-on; the others are not', () => {
    expect(catalogItem('addon_team').perSeat).toBe(true)
    expect(catalogItem('addon_marketing').perSeat).toBe(false)
    expect(catalogItem('addon_ai').perSeat).toBe(false)
    expect(catalogItem('addon_branding').perSeat).toBe(false)
  })

  it('Organization keeps the $249 list / $199 founding floor anchor', () => {
    const org = catalogItem('organization')
    expect(org.month.listCents).toBe(24900)
    expect(org.month.foundingCents).toBe(19900)
  })
})

describe('catalog price keys', () => {
  it('the founding (charged) key is <item>_<interval>; the list anchor adds _list', () => {
    expect(catalogPriceKey('pro_base', 'month')).toBe('pro_base_month')
    expect(catalogPriceKey('pro_base', 'year')).toBe('pro_base_year')
    expect(catalogPriceKey('pro_base', 'month', true)).toBe('pro_base_month_list')
    expect(catalogPriceKey('addon_marketing', 'year', true)).toBe('addon_marketing_year_list')
  })

  it('allCatalogPriceKeys = 7 items x 2 intervals x 2 variants = 28 keys', () => {
    const keys = allCatalogPriceKeys()
    expect(keys).toHaveLength(28)
    expect(keys).toContain('pro_base_month')
    expect(keys).toContain('pro_base_month_list')
    expect(keys).toContain('nonprofit_seat_year')
    expect(keys).toContain('organization_month_list')
    // every key is unique
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('add-on item bridge + narrowing', () => {
  it('maps the four addon_* items to their entitlement add-on key; plan items map to null', () => {
    expect(addonKeyForCatalogItem('addon_marketing')).toBe('marketing')
    expect(addonKeyForCatalogItem('addon_ai')).toBe('ai')
    expect(addonKeyForCatalogItem('addon_team')).toBe('team')
    expect(addonKeyForCatalogItem('addon_branding')).toBe('branding')
    expect(addonKeyForCatalogItem('pro_base')).toBeNull()
    expect(addonKeyForCatalogItem('nonprofit_seat')).toBeNull()
    expect(addonKeyForCatalogItem('organization')).toBeNull()
  })

  it('asCatalogItemKey is default-deny', () => {
    expect(asCatalogItemKey('pro_base')).toBe('pro_base')
    expect(asCatalogItemKey('nonsense')).toBeNull()
    expect(asCatalogItemKey(null)).toBeNull()
  })
})

describe('retired legacy keys (kept resolvable, never deleted)', () => {
  it('covers the retired tiers (practitioner/business/whitelabel/supporter) and excludes the live catalog', () => {
    expect(RETIRED_CATALOG_KEYS).toContain('practitioner_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('business_annual')
    expect(RETIRED_CATALOG_KEYS).toContain('whitelabel_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly_founder')
    // none of the new catalog keys are in the retired set
    for (const k of allCatalogPriceKeys()) {
      expect(RETIRED_CATALOG_KEYS).not.toContain(k)
    }
  })
})
