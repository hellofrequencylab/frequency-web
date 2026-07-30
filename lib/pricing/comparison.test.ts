import { describe, it, expect } from 'vitest'
import {
  COMPARISON_GROUPS,
  allComparisonRows,
  competitorMonthlyTotal,
  comparisonToolCount,
  monthlySaving,
  yearlySaving,
  FREQUENCY_BUSINESS_MONTHLY,
  FREQUENCY_ALL_IN_MONTHLY,
} from './comparison'
import { catalogItem, type CatalogItemKey } from '@/lib/billing/pricing-keys'
import { effectiveCatalogAmounts, isBetaPricingActive } from './beta'
import { ADDON_KEYS } from './plans'

describe('pricing comparison catalog', () => {
  it('has non-empty groups, each row fully specified', () => {
    expect(COMPARISON_GROUPS.length).toBeGreaterThan(3)
    for (const row of allComparisonRows()) {
      expect(row.feature.trim()).toBeTruthy()
      expect(row.ours.trim()).toBeTruthy()
      expect(row.competitor.trim()).toBeTruthy()
      expect(row.competitorMonthly === null || row.competitorMonthly > 0).toBe(true)
    }
  })

  it('totals the subscription floor from the numeric rows (fee-based rows excluded)', () => {
    const manual = allComparisonRows().reduce((s, r) => s + (r.competitorMonthly ?? 0), 0)
    expect(competitorMonthlyTotal()).toBe(manual)
    // The stack is materially more than the flat plan (the whole point).
    expect(competitorMonthlyTotal()).toBeGreaterThan(FREQUENCY_BUSINESS_MONTHLY * 5)
  })

  it('counts only real separate tools (excludes the no-equivalent / everywhere-else rows)', () => {
    const tools = comparisonToolCount()
    expect(tools).toBeGreaterThan(10)
    expect(tools).toBeLessThanOrEqual(allComparisonRows().length)
  })

  it('derives the saving from the total minus the flat plan', () => {
    expect(monthlySaving()).toBe(competitorMonthlyTotal() - FREQUENCY_BUSINESS_MONTHLY)
    expect(yearlySaving()).toBe(monthlySaving() * 12)
  })

  // Phase 5 (ADR-915). These anchors used to be literals and had gone stale: $49 was neither the beta
  // rate the checkout charges nor the $29 list, and it rendered live on /pricing. The lock is that they
  // are READ from the same catalog the checkout bills, resolved through the same beta window.
  it('anchors the stack against the REAL Business price, on both sides of the cutover', () => {
    const beta = isBetaPricingActive()
    const business = effectiveCatalogAmounts(catalogItem('business_base').month, beta).foundingCents
    expect(FREQUENCY_BUSINESS_MONTHLY).toBe(Math.round(business / 100))
  })

  it('derives the all-in number as the plan plus every metered add-on, never a typed total', () => {
    const beta = isBetaPricingActive()
    const addons = ADDON_KEYS.reduce(
      (sum, a) =>
        sum +
        Math.round(
          effectiveCatalogAmounts(catalogItem(`addon_${a}` as CatalogItemKey).month, beta).foundingCents / 100,
        ),
      0,
    )
    expect(FREQUENCY_ALL_IN_MONTHLY).toBe(FREQUENCY_BUSINESS_MONTHLY + addons)
    expect(FREQUENCY_ALL_IN_MONTHLY).toBeGreaterThan(FREQUENCY_BUSINESS_MONTHLY)
  })

  it('has no em dashes in any copy (CONTENT-VOICE canon)', () => {
    for (const row of allComparisonRows()) {
      for (const s of [row.feature, row.ours, row.competitor, row.note ?? '']) {
        expect(s.includes('—'), `em dash in "${s}"`).toBe(false)
      }
    }
  })
})
