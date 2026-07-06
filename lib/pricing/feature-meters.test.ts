import { describe, it, expect } from 'vitest'

// FEATURE → USAGE METER LADDER (ADR-519, owner directive #4: feature-GATES → usage-METERS). The gate
// this batch is measured against:
//   * every tier-gated FEATURE_GATES key is EITHER metered (has a per-tier allowance ladder) OR
//     consciously non-metered (in NON_METERED_FEATURES with a reason) — no gated feature is unaccounted;
//   * every meter ladder is well-formed: a free floor, ascending rungs, an allowance + placeholder price
//     per rung, on-canon copy (no em/en dashes), and the placeholder flag on;
//   * NOTHING CHARGES / NOTHING HARD-BLOCKS: withinAllowance always returns true while billing is off,
//     and even over-allowance usage is never blocked in that mode.

import { FEATURE_GATES } from './gates'
import {
  FEATURE_METERS,
  FEATURE_METER_KEYS,
  NON_METERED_FEATURES,
  PLACEHOLDER_ALLOWANCES,
  featureMeter,
  allowanceAt,
  allowanceLabel,
  allowanceReadout,
  currentMeterStepIndex,
  withinAllowance,
} from './feature-meters'
import { tierRankOnAxis } from './feature-tiers'

/** The tier-gated feature keys, derived from the code gate map: enabled AND ranked above the free floor
 *  on the gate's own axis. This is the set the metered model must ACCOUNT for (meter it, or mark it as
 *  consciously non-metered). */
function gatedFeatureKeys(): string[] {
  return Object.entries(FEATURE_GATES)
    .filter(([, g]) => g.enabled && tierRankOnAxis(g.axis, g.minEntitlement) > 0)
    .map(([k]) => k)
}

describe('coverage — every tier-gated feature is metered OR consciously non-metered', () => {
  it('accounts for every gated FEATURE_GATES key (a meter, or a stated non-metered reason)', () => {
    for (const key of gatedFeatureKeys()) {
      const accounted = key in FEATURE_METERS || key in NON_METERED_FEATURES
      expect(accounted, `gated feature ${key} is neither metered nor marked non-metered`).toBe(true)
    }
  })

  it('a feature is never BOTH metered and non-metered (no ambiguity)', () => {
    for (const key of FEATURE_METER_KEYS) {
      expect(key in NON_METERED_FEATURES, `${key} is both metered and non-metered`).toBe(false)
    }
  })

  it('every non-metered entry carries a non-empty reason', () => {
    for (const [key, reason] of Object.entries(NON_METERED_FEATURES)) {
      expect(reason.length, `non-metered ${key} needs a reason`).toBeGreaterThan(0)
    }
  })

  it("every metered feature's axis matches its FEATURE_GATES axis (no drift)", () => {
    for (const key of FEATURE_METER_KEYS) {
      const gate = FEATURE_GATES[key]
      // A meter may exist for a gated feature; when the gate exists, the axis must agree.
      if (gate) expect(FEATURE_METERS[key]!.axis).toBe(gate.axis)
    }
  })
})

describe('shape — every meter ladder is well-formed with per-tier placeholder allowances', () => {
  it('has a free floor and at least one higher rung, ascending by rank', () => {
    for (const key of FEATURE_METER_KEYS) {
      const ladder = FEATURE_METERS[key]!
      expect(ladder.steps.length).toBeGreaterThanOrEqual(2)
      expect(ladder.steps[0]!.isFree).toBe(true)
      expect(ladder.steps[0]!.tier).toBe('free')
      for (let i = 1; i < ladder.steps.length; i++) {
        expect(tierRankOnAxis(ladder.axis, ladder.steps[i]!.tier)).toBeGreaterThan(
          tierRankOnAxis(ladder.axis, ladder.steps[i - 1]!.tier),
        )
      }
    }
  })

  it('every rung has an allowance (number ≥ 0 or null=unlimited) + a non-empty allowance line + a price', () => {
    for (const key of FEATURE_METER_KEYS) {
      const ladder = FEATURE_METERS[key]!
      expect(ladder.dimension.length).toBeGreaterThan(0)
      expect(ladder.unit.length).toBeGreaterThan(0)
      for (const step of ladder.steps) {
        expect(step.allowanceText.length).toBeGreaterThan(0)
        expect(step.price.length).toBeGreaterThan(0)
        expect(step.label.length).toBeGreaterThan(0)
        if (step.allowance !== null) expect(step.allowance).toBeGreaterThanOrEqual(0)
        if (step.isFree) {
          expect(step.price).toBe('Free')
          expect(step.priceCents).toBe(0)
        }
      }
    }
  })

  it('allowances only rise up the ladder (a higher tier never gives LESS, unlimited tops)', () => {
    for (const key of FEATURE_METER_KEYS) {
      const ladder = FEATURE_METERS[key]!
      let sawUnlimited = false
      let prev = -1
      for (const step of ladder.steps) {
        if (step.allowance === null) {
          sawUnlimited = true
          continue
        }
        // Once a rung is unlimited, a later rung must not drop back to a finite cap.
        expect(sawUnlimited, `${key}: finite allowance after unlimited`).toBe(false)
        expect(step.allowance).toBeGreaterThanOrEqual(prev)
        prev = step.allowance
      }
    }
  })

  it('is on-canon: no em or en dashes in any title, dimension, or allowance line', () => {
    for (const key of FEATURE_METER_KEYS) {
      const ladder = FEATURE_METERS[key]!
      expect(ladder.title).not.toMatch(/[–—]/)
      expect(ladder.dimension).not.toMatch(/[–—]/)
      for (const step of ladder.steps) {
        expect(step.allowanceText).not.toMatch(/[–—]/)
        expect(step.label).not.toMatch(/[–—]/)
      }
    }
    for (const reason of Object.values(NON_METERED_FEATURES)) {
      expect(reason).not.toMatch(/[–—]/)
    }
  })

  it('the placeholder-allowance flag is on and stamped on every ladder', () => {
    expect(PLACEHOLDER_ALLOWANCES).toBe(true)
    for (const key of FEATURE_METER_KEYS) {
      expect(FEATURE_METERS[key]!.placeholderAllowances).toBe(true)
    }
  })
})

describe('label + readout formatting', () => {
  it('allowanceLabel renders a cap, a period, and unlimited plainly', () => {
    expect(allowanceLabel(100, 'contacts', null)).toBe('Up to 100 contacts')
    expect(allowanceLabel(5000, 'sends', 'month')).toBe('Up to 5,000 sends/mo')
    expect(allowanceLabel(10, 'messages', 'day')).toBe('Up to 10 messages/day')
    expect(allowanceLabel(null, 'contacts', null)).toBe('Unlimited contacts')
  })

  it('allowanceReadout renders "X of N used" or the unlimited form; null for a non-metered feature', () => {
    // CRM free allowance is a finite placeholder → "X of N used".
    expect(allowanceReadout('space_crm', 'free', 12)).toMatch(/^12 of [\d,]+ contacts used$/)
    // A tier whose allowance is unlimited → the unlimited form.
    expect(allowanceReadout('space_crm', 'business', 12)).toBe('12 contacts used (unlimited)')
    // A non-metered feature has no readout.
    expect(allowanceReadout('space_whitelabel', 'free', 3)).toBeNull()
  })
})

describe('read helpers', () => {
  it('featureMeter returns null for a non-metered / unknown feature', () => {
    expect(featureMeter('space_whitelabel')).toBeNull()
    expect(featureMeter('made-up')).toBeNull()
  })

  it('currentMeterStepIndex maps a viewer tier to the highest rung at/below it', () => {
    const crm = featureMeter('space_crm')! // steps: free, business
    expect(currentMeterStepIndex(crm, 'free')).toBe(0)
    expect(currentMeterStepIndex(crm, 'business')).toBe(1)
    // Nonprofit ranks above business (the top rung) → maps to the business rung.
    expect(currentMeterStepIndex(crm, 'nonprofit')).toBe(1)
    // Unknown tier → the free floor.
    expect(currentMeterStepIndex(crm, 'nonsense')).toBe(0)
  })

  it('allowanceAt returns the tier allowance, or null for unlimited / non-metered', () => {
    expect(allowanceAt('space_crm', 'free')).toBe(250) // §2 free CRM allowance (ADR-552 Phase 3)
    expect(allowanceAt('space_crm', 'business')).toBeNull() // unlimited
    expect(allowanceAt('space_crm', 'nonprofit')).toBeNull() // maps to business rung (unlimited)
    expect(allowanceAt('space_whitelabel', 'free')).toBeNull() // not metered
  })
})

describe('the enforcement seam — nothing charges / nothing hard-blocks while billing is off', () => {
  it('withinAllowance ALWAYS returns true while billing is off, even far over the allowance', () => {
    // Free CRM allowance is 250 contacts (§2); 10x over it must still not be blocked while billing is off.
    expect(withinAllowance('space_crm', 'free', 1_000_000, { billingLive: false })).toBe(true)
    // Every metered feature, at its free floor, wildly over allowance → still true (informational only).
    for (const key of FEATURE_METER_KEYS) {
      expect(withinAllowance(key, 'free', Number.MAX_SAFE_INTEGER, { billingLive: false })).toBe(true)
    }
  })

  it('a non-metered or unknown feature is never blocked, even once billing is live', () => {
    expect(withinAllowance('space_whitelabel', 'free', 999, { billingLive: true })).toBe(true)
    expect(withinAllowance('made-up', 'free', 999, { billingLive: true })).toBe(true)
  })

  it('with billing LIVE it enforces the seam (usage vs allowance) — the go-live behavior', () => {
    // At/under the free cap passes; over it fails; an unlimited tier always passes.
    expect(withinAllowance('space_crm', 'free', 250, { billingLive: true })).toBe(true)
    expect(withinAllowance('space_crm', 'free', 251, { billingLive: true })).toBe(false)
    expect(withinAllowance('space_crm', 'business', Number.MAX_SAFE_INTEGER, { billingLive: true })).toBe(true)
  })

  it('nothing charges: the module exposes no price mutation or charge path (allowances are data only)', () => {
    // The meter ladder is pure display data: no function here charges, and the placeholder flag guards
    // go-live. This asserts the informational contract holds for every ladder.
    for (const key of FEATURE_METER_KEYS) {
      const ladder = FEATURE_METERS[key]!
      expect(ladder.placeholderAllowances).toBe(true)
      // The free floor is always $0 (never a charge to be on the free allowance).
      expect(ladder.steps[0]!.priceCents).toBe(0)
    }
  })
})
