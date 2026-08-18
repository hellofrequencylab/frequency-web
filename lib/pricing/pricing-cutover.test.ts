import { describe, it, expect } from 'vitest'

// ADR-880 — THE PAGE MUST RESOLVE A PRICE THE WAY THE CHECKOUT CHARGES IT.
//
// THE DEFECT. /pricing advertised the Opening Beta rate PERMANENTLY: the display row's only anchor rule
// is "list_cents is above monthly_cents", which stays true forever after migration 20270115000000 wrote
// {monthly:1900, list:2900} / {monthly:4900, list:7900}. The checkout has a clock —
// resolveLoadoutPriceId charges the LIST price key once `!isBetaPricingActive()` — so from
// 2026-09-01T07:00:00Z the page (and its JSON-LD Offers, its OG description, and its FAQ "you keep it"
// answer) would say $19/$49 while Stripe charged $29/$79.
//
// THE LOCK. One table-driven test over every sellable Space tier x {monthly, yearly} x {beta,
// post-beta}, asserting the PAGE number equals the CHECKOUT number. It fails the build on any future
// drift between the operator-editable pricing values the page reads and the catalog the checkout bills.

import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'
import { effectiveCatalogAmounts, isBetaPricingActive, BETA_PRICING_ENDS_AT } from './beta'
import { effectiveTierPrice, PAID_SPACE_PLANS, spacePlanRows } from './display'
import { spaceOfferings, type PricingGridInput } from './pricing-grid'
import { PRICING_DEFAULTS } from './settings'
import type { CatalogItemKey } from '@/lib/billing/pricing-keys'

const catalog = catalogConfigByKey(defaultCatalogConfig())

/** The catalog item each sellable plan is BILLED from (space-plan-checkout catalogKeysForLoadout). */
const BASE_ITEM: Record<string, CatalogItemKey> = {
  business: 'business_base',
  collective: 'collective_base',
  nonprofit: 'nonprofit_seat',
  independent: 'independent_base',
}

/** What the CHECKOUT charges for a plan at an interval, in cents: the founding price key during the
 *  beta window, the list price key after it. This is resolveLoadoutPriceId's rule, in amounts. */
function checkoutCents(plan: string, interval: 'month' | 'year', betaActive: boolean): number {
  const amounts = catalog[BASE_ITEM[plan]!][interval]
  return effectiveCatalogAmounts(amounts, betaActive).foundingCents
}

const input = (betaActive: boolean): PricingGridInput => ({
  values: PRICING_DEFAULTS,
  catalog,
  betaActive,
})

describe('page price == checkout price, on BOTH sides of the cutover', () => {
  for (const betaActive of [true, false]) {
    const window = betaActive ? 'during the beta window' : 'after the cutover'
    for (const plan of PAID_SPACE_PLANS) {
      it(`${plan}, ${window}: the monthly and yearly the page prints are the ones Stripe takes`, () => {
        const row = spacePlanRows(PRICING_DEFAULTS, betaActive).find((r) => r.key === plan)!
        expect(row.monthlyCents, `${plan} monthly`).toBe(checkoutCents(plan, 'month', betaActive))
        expect(row.annualCents, `${plan} yearly`).toBe(checkoutCents(plan, 'year', betaActive))
      })

      it(`${plan}, ${window}: the offering card + its JSON-LD Offer quote that same number`, () => {
        const offering = spaceOfferings(input(betaActive)).find((o) => o.id === plan)!
        expect(offering.monthlyCents).toBe(checkoutCents(plan, 'month', betaActive))
      })
    }
  }
})

describe('the beta framing appears exactly while the beta rate does', () => {
  it('DURING the window: COLLECTIVE alone shows a struck anchor and the beta note (ADR-1067)', () => {
    const byId = Object.fromEntries(spaceOfferings(input(true)).map((o) => [o.id, o]))
    expect(byId.collective!.listAnchor).toBe('$79')
    expect(byId.collective!.monthly).toBe('$49/mo')
    expect(byId.collective!.betaNote).toContain('Beta rate')
    // Business used to sit beside it at $19 under $29. There is exactly ONE beta offer now, and even
    // with the window forced open Business must quote its plain list price with NO strike and NO note
    // — otherwise the page advertises a rate the owner does not sell.
    expect(byId.business!.monthly).toBe('$29/mo')
    expect(byId.business!.listAnchor).toBeNull()
    expect(byId.business!.betaNote ?? null).toBeNull()
  })

  it('AFTER the cutover: the list IS the price, with NO strike and NO beta note', () => {
    const byId = Object.fromEntries(spaceOfferings(input(false)).map((o) => [o.id, o]))
    expect(byId.business!.monthly).toBe('$29/mo')
    expect(byId.business!.yearly).toBe('$290/yr')
    expect(byId.business!.listAnchor).toBeNull()
    expect(byId.business!.betaNote).toBeNull()
    expect(byId.collective!.monthly).toBe('$79/mo')
    expect(byId.collective!.listAnchor).toBeNull()
    expect(byId.collective!.betaNote).toBeNull()
  })

  it('a plan that never had a beta rate never moves, on either side', () => {
    for (const betaActive of [true, false]) {
      const byId = Object.fromEntries(spaceOfferings(input(betaActive)).map((o) => [o.id, o]))
      expect(byId.nonprofit!.monthly).toBe('$39/mo')
      expect(byId.nonprofit!.listAnchor).toBeNull()
      expect(byId.independent!.monthly).toBe('$249/mo')
      expect(byId.independent!.listAnchor).toBeNull()
    }
  })

  it('Free is free on both sides, and is never an Offer', () => {
    for (const betaActive of [true, false]) {
      const free = spaceOfferings(input(betaActive)).find((o) => o.id === 'free')!
      expect(free.monthlyCents).toBe(0)
      expect(free.monthly).toBe('Free')
    }
  })
})

describe('effectiveTierPrice (the display twin of effectiveCatalogAmounts)', () => {
  it('during beta it is the identity: nothing is reshaped while the offer is real', () => {
    const price = { monthly_cents: 1900, annual_cents: 19000, list_cents: 2900 }
    expect(effectiveTierPrice(price, true)).toEqual(price)
  })

  it('after the cutover the anchor becomes the price and stops being an anchor', () => {
    expect(effectiveTierPrice({ monthly_cents: 1900, annual_cents: 19000, list_cents: 2900 }, false)).toEqual({
      monthly_cents: 2900,
      annual_cents: 29000, // two months free, off the new price
    })
  })

  it('a price with no anchor, or an anchor at or below the price, is untouched', () => {
    const flat = { monthly_cents: 3900, annual_cents: 39000 }
    expect(effectiveTierPrice(flat, false)).toEqual(flat)
    const equal = { monthly_cents: 3900, annual_cents: 39000, list_cents: 3900 }
    expect(effectiveTierPrice(equal, false)).toEqual(equal)
  })

  it('a monthly-only price keeps its null annual rather than inventing one', () => {
    expect(effectiveTierPrice({ monthly_cents: 1900, annual_cents: null, list_cents: 2900 }, false)).toEqual({
      monthly_cents: 2900,
      annual_cents: null,
    })
  })
})

describe('the window itself', () => {
  it('the grid defaults to the live clock, so a caller that forgets still cannot lie', () => {
    const withoutFlag = spaceOfferings({ values: PRICING_DEFAULTS, catalog })
    const withFlag = spaceOfferings(input(isBetaPricingActive()))
    expect(withoutFlag.map((o) => o.monthlyCents)).toEqual(withFlag.map((o) => o.monthlyCents))
  })

  it('is the same instant the checkout reads', () => {
    expect(isBetaPricingActive(new Date(Date.parse(BETA_PRICING_ENDS_AT) - 1))).toBe(true)
    expect(isBetaPricingActive(new Date(Date.parse(BETA_PRICING_ENDS_AT)))).toBe(false)
  })
})
