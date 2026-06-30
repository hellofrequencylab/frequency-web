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

describe('the clean catalog shape (re-tiered · ADR-472)', () => {
  it('holds exactly the five tier items (Pro base, Business base, AI add-on, nonprofit seat, org)', () => {
    expect([...CATALOG_ITEM_KEYS]).toEqual([
      'pro_base',
      'business_base',
      'addon_ai',
      'nonprofit_seat',
      'organization',
    ])
    expect(catalogItems()).toHaveLength(5)
  })

  it('Business base: $49 base, the full-depth team tier, not per seat', () => {
    const biz = catalogItem('business_base')
    expect(biz.month.foundingCents).toBe(4900)
    expect(biz.month.listCents).toBe(4900) // no separate anchor published today (founding == list)
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

  it('the AI add-on is metered (not per-seat); tier bases are not per-seat', () => {
    expect(catalogItem('addon_ai').perSeat).toBe(false)
    expect(catalogItem('pro_base').perSeat).toBe(false)
    expect(catalogItem('business_base').perSeat).toBe(false)
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
    expect(catalogPriceKey('business_base', 'year', true)).toBe('business_base_year_list')
  })

  it('allCatalogPriceKeys = 5 items x 2 intervals x 2 variants = 20 keys', () => {
    const keys = allCatalogPriceKeys()
    expect(keys).toHaveLength(20)
    expect(keys).toContain('pro_base_month')
    expect(keys).toContain('pro_base_month_list')
    expect(keys).toContain('business_base_month')
    expect(keys).toContain('nonprofit_seat_year')
    expect(keys).toContain('organization_month_list')
    // every key is unique
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('add-on item bridge + narrowing (re-tiered · ADR-472)', () => {
  it('maps addon_ai to the sole entitlement add-on key; tier items map to null', () => {
    expect(addonKeyForCatalogItem('addon_ai')).toBe('ai')
    expect(addonKeyForCatalogItem('pro_base')).toBeNull()
    expect(addonKeyForCatalogItem('business_base')).toBeNull()
    expect(addonKeyForCatalogItem('nonprofit_seat')).toBeNull()
    expect(addonKeyForCatalogItem('organization')).toBeNull()
  })

  it('asCatalogItemKey is default-deny (the retired add-on items no longer narrow)', () => {
    expect(asCatalogItemKey('pro_base')).toBe('pro_base')
    expect(asCatalogItemKey('business_base')).toBe('business_base')
    expect(asCatalogItemKey('addon_marketing')).toBeNull() // retired (ADR-472)
    expect(asCatalogItemKey('nonsense')).toBeNull()
    expect(asCatalogItemKey(null)).toBeNull()
  })
})

describe('retired legacy keys (kept resolvable, never deleted)', () => {
  it('covers the retired tiers + the retired add-on items, and excludes the live catalog', () => {
    // Pre-ladder per-plan tiers.
    expect(RETIRED_CATALOG_KEYS).toContain('practitioner_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('business_annual')
    expect(RETIRED_CATALOG_KEYS).toContain('whitelabel_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly')
    expect(RETIRED_CATALOG_KEYS).toContain('supporter_monthly_founder')
    // The Marketing/Team/Branding add-on catalog items retired by ADR-472 (founding + _list variants).
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
