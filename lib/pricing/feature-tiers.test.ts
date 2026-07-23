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
  PLACEHOLDER_SPACE_PRICE_CENTS,
  PLACEHOLDER_MEMBER_PRICE_CENTS,
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
  it('PLACEHOLDER_PRICING is on, so every ladder is preview-only', () => {
    expect(PLACEHOLDER_PRICING).toBe(true)
    for (const key of FEATURE_TIER_KEYS) {
      expect(FEATURE_TIER_LADDERS[key]!.placeholderPricing).toBe(true)
    }
  })

  it('placeholder price maps mirror the code catalog founding rates', () => {
    // Space: Business $29, Collective $79, Non Profit $39, Independent $249; free at $0 (ADR-811).
    expect(PLACEHOLDER_SPACE_PRICE_CENTS.free).toBe(0)
    expect(PLACEHOLDER_SPACE_PRICE_CENTS.business).toBe(2900)
    expect(PLACEHOLDER_SPACE_PRICE_CENTS.collective).toBe(7900)
    expect(PLACEHOLDER_SPACE_PRICE_CENTS.nonprofit).toBe(3900)
    expect(PLACEHOLDER_SPACE_PRICE_CENTS.independent).toBe(24900)
    // Personal: Crew $9; free at $0.
    expect(PLACEHOLDER_MEMBER_PRICE_CENTS.free).toBe(0)
    expect(PLACEHOLDER_MEMBER_PRICE_CENTS.crew).toBe(900)
  })
})

describe('read helpers', () => {
  it('featureTierLadder returns null for an ungated / unknown feature', () => {
    expect(featureTierLadder('space_storefront')).toBeNull() // free floor, not gated
    expect(featureTierLadder('made-up')).toBeNull()
  })

  it('isFeatureUnlockedAt: below the min tier is locked, at/above is unlocked', () => {
    const crm = featureTierLadder('space_crm')!
    expect(isFeatureUnlockedAt(crm, 'free')).toBe(false)
    expect(isFeatureUnlockedAt(crm, 'business')).toBe(true)
    // Nonprofit ranks above business, so it clears the business floor.
    expect(isFeatureUnlockedAt(crm, 'nonprofit')).toBe(true)
    const vera = featureTierLadder('vera_unlimited')!
    expect(isFeatureUnlockedAt(vera, 'free')).toBe(false)
    expect(isFeatureUnlockedAt(vera, 'crew')).toBe(true)
  })

  it('currentStepIndex maps a viewer tier to the highest rung at/below it', () => {
    const crm = featureTierLadder('space_crm')! // steps: free, business
    expect(currentStepIndex(crm, 'free')).toBe(0)
    expect(currentStepIndex(crm, 'business')).toBe(1)
    // Nonprofit ranks above business (the top rung) → maps to the business rung.
    expect(currentStepIndex(crm, 'nonprofit')).toBe(1)
    // Unknown tier → the free floor.
    expect(currentStepIndex(crm, 'nonsense')).toBe(0)
  })
})
