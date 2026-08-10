import { describe, it, expect } from 'vitest'

// FEATURE → TIER LADDER + PLACEHOLDER PRICING (ADR-518 Phase G). The gate this batch is measured against:
//   * every tier-gated FEATURE_GATES key has a ladder here, and its minTier matches the gate's minimum
//     (the display ladder can never drift from the real gate);
//   * every ladder carries a placeholder PRICE POINT per rung, in ascending order, on-canon (no em dashes);
//   * NOTHING charges: PLACEHOLDER_PRICING stays true and the placeholder amounts are preview-only.

import { FEATURE_GATES, meetsGate } from './gates'
import {
  FEATURE_TIER_LADDERS,
  FEATURE_TIER_KEYS,
  PLACEHOLDER_PRICING,
  PLACEHOLDER_MEMBER_PRICE_CENTS,
  SPACE_PLAN_PRICE_CENTS,
  spacePlanPriceCents,
  tierPriceCents,
  tierPriceLabel,
  featureTierLadder,
  isFeatureUnlockedAt,
  currentStepIndex,
  tierRankOnAxis,
} from './feature-tiers'

/** The tier-gated feature keys, derived from the code gate map: enabled AND ranked above the free floor
 *  on the gate's own axis. This is the set the range selector must cover. */
function gatedFeatureKeys(): string[] {
  return Object.entries(FEATURE_GATES)
    .filter(([, g]) => g.enabled && tierRankOnAxis(g.axis, g.minEntitlement) > 0)
    .map(([k]) => k)
}

import { catalogItem, yearlyFromMonthly, type CatalogItemKey } from '@/lib/billing/pricing-keys'
import { effectiveCatalogAmounts, isBetaPricingActive } from './beta'
import { featureMeter } from './feature-meters'
import { formatCents } from './display'
import { PRICING_DEFAULTS } from './defaults'
import { SPACE_PLANS, type SpacePlan } from './plans'

/** The catalog item each PAID plan is billed from, restated here on purpose: the test asserts the
 *  mapping the module makes rather than importing the module's own private copy of it. */
const PLAN_ITEM: Record<Exclude<SpacePlan, 'free'>, CatalogItemKey> = {
  business: 'business_base',
  collective: 'collective_base',
  nonprofit: 'nonprofit_seat',
  independent: 'independent_base',
}

describe('coverage — every tier-gated FEATURE_GATES key has a ladder that matches the gate', () => {
  it('covers every gated feature (no drift between the gate map and the display ladders)', () => {
    for (const key of gatedFeatureKeys()) {
      const ladder = featureTierLadder(key)
      expect(ladder, `missing tier ladder for gated feature ${key}`).not.toBeNull()
    }
  })

  it('each ladder axis + minTier equals the FEATURE_GATES entry', () => {
    for (const key of FEATURE_TIER_KEYS) {
      const gate = FEATURE_GATES[key]
      const ladder = FEATURE_TIER_LADDERS[key]!
      // Every ladder key is a real, enabled gate.
      expect(gate, `ladder ${key} has no FEATURE_GATES entry`).toBeTruthy()
      expect(ladder.axis).toBe(gate!.axis)
      expect(ladder.minTier).toBe(gate!.minEntitlement)
    }
  })

  it("the ladder's minTier unlock agrees with meetsGate (a rung at/above minTier clears the gate)", () => {
    for (const key of FEATURE_TIER_KEYS) {
      const ladder = FEATURE_TIER_LADDERS[key]!
      const gate = FEATURE_GATES[key]!
      for (const step of ladder.steps) {
        const account = ladder.axis === 'plan' ? { plan: step.tier as never } : { tier: step.tier as never }
        // With billing live, meetsGate and the ladder's unlocked flag must agree for every rung.
        expect(meetsGate(gate, account)).toBe(step.unlocked)
      }
    }
  })
})

describe('shape — every ladder is well-formed with placeholder price points', () => {
  it('has at least a free floor and a paid rung, ascending by rank', () => {
    for (const key of FEATURE_TIER_KEYS) {
      const ladder = FEATURE_TIER_LADDERS[key]!
      expect(ladder.steps.length).toBeGreaterThanOrEqual(2)
      expect(ladder.steps[0]!.isFree).toBe(true)
      expect(ladder.steps[0]!.tier).toBe('free')
      // Strictly ascending tier rank across the rungs.
      for (let i = 1; i < ladder.steps.length; i++) {
        expect(tierRankOnAxis(ladder.axis, ladder.steps[i]!.tier)).toBeGreaterThan(
          tierRankOnAxis(ladder.axis, ladder.steps[i - 1]!.tier),
        )
      }
    }
  })

  it('every rung carries a non-empty price label + an unlock line; free reads "Free" at 0 cents', () => {
    for (const key of FEATURE_TIER_KEYS) {
      for (const step of FEATURE_TIER_LADDERS[key]!.steps) {
        expect(step.price.length).toBeGreaterThan(0)
        expect(step.unlocks.length).toBeGreaterThan(0)
        expect(step.label.length).toBeGreaterThan(0)
        if (step.isFree) {
          expect(step.price).toBe('Free')
          expect(step.priceCents).toBe(0)
        } else {
          expect(step.priceCents).toBeGreaterThan(0)
        }
      }
    }
  })

  it('is on-canon: no em or en dashes in any title, label, or unlock line', () => {
    for (const key of FEATURE_TIER_KEYS) {
      const ladder = FEATURE_TIER_LADDERS[key]!
      expect(ladder.title).not.toMatch(/[–—]/)
      for (const step of ladder.steps) {
        expect(step.unlocks).not.toMatch(/[–—]/)
        expect(step.label).not.toMatch(/[–—]/)
      }
    }
  })
})

describe('placeholder pricing — nothing charges (the go-live switch)', () => {
  it('PLACEHOLDER_PRICING is OFF: billing is live, so no ladder claims a preview', () => {
    // Flipped with billing going live (ADR-920). While it was true, the pricing surfaces printed
    // "nothing is charged" on the two pages where people actually pay.
    expect(PLACEHOLDER_PRICING).toBe(false)
    for (const key of FEATURE_TIER_KEYS) {
      expect(FEATURE_TIER_LADDERS[key]!.placeholderPricing).toBe(false)
    }
  })

  // Phase 5 (ADR-916). These maps used to be typed literals, and Business's read $29 (the list) while
  // /pricing quoted $19 (the beta rate the checkout actually charges). The lock is that the map is READ
  // from the catalog the checkout bills, carrying BOTH numbers for EVERY plan, so no tier can be the one
  // that was forgotten. Asserted against the catalog, never against a repeated literal.
  it('the Space price map is READ from the code catalog, list and beta, for every plan', () => {
    expect(SPACE_PLAN_PRICE_CENTS.free).toEqual({ listCents: 0, foundingCents: 0 })
    for (const [plan, item] of Object.entries(PLAN_ITEM)) {
      expect(SPACE_PLAN_PRICE_CENTS[plan as SpacePlan], plan).toEqual(catalogItem(item).month)
    }
  })

  it('beta-vs-list is one shape, not a per-tier patch: every plan resolves both sides of the cutover', () => {
    for (const plan of SPACE_PLANS) {
      const amounts = SPACE_PLAN_PRICE_CENTS[plan]
      // During beta a plan is charged its founding amount; after the cutover the list becomes the price.
      expect(spacePlanPriceCents(plan, true), plan).toBe(amounts.foundingCents)
      expect(spacePlanPriceCents(plan, false), plan).toBe(amounts.listCents)
      expect(tierPriceCents('plan', plan, true), plan).toBe(amounts.foundingCents)
      expect(tierPriceCents('plan', plan, false), plan).toBe(amounts.listCents)
    }
    // Business has a beta rate too. That it had no constant of its own is exactly the bug.
    expect(SPACE_PLAN_PRICE_CENTS.business.foundingCents).toBeLessThan(
      SPACE_PLAN_PRICE_CENTS.business.listCents,
    )
  })

  it('a ladder rung quotes the price the checkout charges TODAY, matching /pricing', () => {
    const beta = isBetaPricingActive()
    for (const plan of SPACE_PLANS) {
      const charged = effectiveCatalogAmounts(SPACE_PLAN_PRICE_CENTS[plan], beta).foundingCents
      expect(tierPriceLabel('plan', plan), plan).toBe(charged === 0 ? 'Free' : `${formatCents(charged)}/mo`)
    }
  })

  it('the member price map is the ONE source the settings layer reads for Crew', () => {
    expect(PLACEHOLDER_MEMBER_PRICE_CENTS.free).toBe(0)
    expect(PRICING_DEFAULTS.tier.crew.monthly_cents).toBe(PLACEHOLDER_MEMBER_PRICE_CENTS.crew)
    expect(PRICING_DEFAULTS.tier.crew.annual_cents).toBe(
      yearlyFromMonthly(PLACEHOLDER_MEMBER_PRICE_CENTS.crew),
    )
  })
})

// ── Contradiction #6: the unlock copy used to mirror the meter numbers BY COMMENT ─────────────────────
// "@placeholder 200 mirrors PLACEHOLDER_METER_LIMITS.space_crm ... keep these lines in step" is not a
// mechanism, it is a hope. ADR-914 lowered the CRM allowance from 250 to 200 and the copy had to be
// hand-chased. This asserts the relationship instead: any quantity a ladder line NAMES must be an
// allowance the feature's meter actually grants on some tier.
describe('ladder unlock copy cannot drift from the meter it describes', () => {
  /** Every number token in a line ("200", "5,000"), as plain integers. */
  function numbersIn(line: string): number[] {
    return (line.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d+\b/g) ?? []).map((n) => Number(n.replace(/,/g, '')))
  }

  it('every quantity in an unlock line is a real allowance on that feature meter', () => {
    for (const key of FEATURE_TIER_KEYS) {
      const meter = featureMeter(key)
      if (!meter) continue
      const allowances = new Set(
        meter.steps.map((s) => s.allowance).filter((a): a is number => typeof a === 'number'),
      )
      for (const step of FEATURE_TIER_LADDERS[key]!.steps) {
        for (const n of numbersIn(step.unlocks)) {
          expect(
            allowances.has(n),
            `${key} rung "${step.tier}" names ${n}, which is not an allowance its meter grants (${[...allowances].join(', ')})`,
          ).toBe(true)
        }
      }
    }
  })
})

describe('read helpers', () => {
  it('featureTierLadder returns null for an ungated / unknown feature', () => {
    expect(featureTierLadder('space_storefront')).toBeNull() // free floor, not gated
    expect(featureTierLadder('made-up')).toBeNull()
  })

  it('isFeatureUnlockedAt: below the min tier is locked, at/above is unlocked', () => {
    // Was `space_crm` until ADR-917 made it a meter (a metered feature has no unlock ladder). The
    // shape under test is a plan-axis gate at the Business floor, which `space_memberships` is.
    const wall = featureTierLadder('space_memberships')!
    expect(isFeatureUnlockedAt(wall, 'free')).toBe(false)
    expect(isFeatureUnlockedAt(wall, 'business')).toBe(true)
    // Nonprofit ranks above business, so it clears the business floor.
    expect(isFeatureUnlockedAt(wall, 'nonprofit')).toBe(true)
    const vera = featureTierLadder('vera_unlimited')!
    expect(isFeatureUnlockedAt(vera, 'free')).toBe(false)
    expect(isFeatureUnlockedAt(vera, 'crew')).toBe(true)
  })

  it('currentStepIndex maps a viewer tier to the highest rung at/below it', () => {
    const wall = featureTierLadder('space_memberships')! // steps: free, business
    expect(currentStepIndex(wall, 'free')).toBe(0)
    expect(currentStepIndex(wall, 'business')).toBe(1)
    // Nonprofit ranks above business (the top rung) → maps to the business rung.
    expect(currentStepIndex(wall, 'nonprofit')).toBe(1)
    // Unknown tier → the free floor.
    expect(currentStepIndex(wall, 'nonsense')).toBe(0)
  })
})
