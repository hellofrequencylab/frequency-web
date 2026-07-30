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
  ALLOWANCE_NUDGE,
  FEATURE_METERS,
  FEATURE_METER_KEYS,
  NON_METERED_FEATURES,
  PLACEHOLDER_ALLOWANCES,
  PLACEHOLDER_METER_LIMITS,
  featureMeter,
  allowanceAt,
  allowanceLabel,
  allowanceReadout,
  currentMeterStepIndex,
  nearAllowanceLimit,
  withinAllowance,
  allowanceVerdict,
  allowanceHeadroom,
} from './feature-meters'
import { tierRankOnAxis } from './feature-tiers'

// Derived, never typed: the free CRM allowance moved 250 -> 200 (ADR-914) and three assertions here
// hardcoded the old number. A test that restates a config value is a second source of truth for it.
const FREE_CRM = PLACEHOLDER_METER_LIMITS.space_crm!.free!

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

describe('one source of quantities — PLACEHOLDER_METER_LIMITS is the map every ladder reads (ADR-837)', () => {
  it('the map and the built ladders cover exactly the same feature keys', () => {
    expect(Object.keys(PLACEHOLDER_METER_LIMITS).sort()).toEqual([...FEATURE_METER_KEYS].sort())
  })

  it("every rung's allowance equals the map's row (no second copy of a quantity anywhere)", () => {
    for (const key of FEATURE_METER_KEYS) {
      const limits = PLACEHOLDER_METER_LIMITS[key]!
      for (const step of FEATURE_METERS[key]!.steps) {
        expect(step.allowance, `${key}.${step.tier} drifted from PLACEHOLDER_METER_LIMITS`).toBe(
          limits[step.tier] ?? null,
        )
      }
    }
  })

  it('mirrors the LIVE caps the codebase already enforces (never invents a conflict)', () => {
    // QR codes: lib/qr/space-codes.ts PLAN_CODE_CAPS enforces free 3 / business 500 today.
    expect(PLACEHOLDER_METER_LIMITS.space_qr).toMatchObject({ free: 3, business: 500 })
    // Team seats: lib/spaces/seats.ts BASE_SEAT_ALLOWANCE = 1 (the owner's free seat, ADR-799).
    expect(PLACEHOLDER_METER_LIMITS.space_team!.free).toBe(1)
    // Vera: mirrors PRICING_DEFAULTS.vera_free_daily_cap (~10/day, §2).
    expect(PLACEHOLDER_METER_LIMITS.space_vera!.free).toBe(10)
  })
})

describe('label + readout formatting', () => {
  it('allowanceLabel renders a cap, a period, and unlimited plainly', () => {
    expect(allowanceLabel(100, 'contacts', null)).toBe('Up to 100 contacts')
    expect(allowanceLabel(5000, 'sends', 'month')).toBe('Up to 5,000 sends/mo')
    expect(allowanceLabel(10, 'messages', 'day')).toBe('Up to 10 messages/day')
    expect(allowanceLabel(null, 'contacts', null)).toBe('Unlimited contacts')
  })

  it('allowanceLabel handles the edge counts honestly: zero is "not included", one drops the plural', () => {
    expect(allowanceLabel(0, 'runs', 'month')).toBe('Not included on this plan')
    expect(allowanceLabel(1, 'pipelines', null)).toBe('Up to 1 pipeline')
  })

  it('the seats ladder says INCLUDED seats and the per-seat add-on, never a wall (ADR-799)', () => {
    const seats = featureMeter('space_team')!
    const top = seats.steps[seats.steps.length - 1]!
    expect(top.allowanceText).toBe('3 seats included, add more per seat')
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
    const crm = featureMeter('space_crm')! // steps: free, business, collective
    expect(currentMeterStepIndex(crm, 'free')).toBe(0)
    expect(currentMeterStepIndex(crm, 'business')).toBe(1)
    expect(currentMeterStepIndex(crm, 'collective')).toBe(2)
    // Nonprofit ranks above collective (the top rung) → maps to the collective rung.
    expect(currentMeterStepIndex(crm, 'nonprofit')).toBe(2)
    // Unknown tier → the free floor.
    expect(currentMeterStepIndex(crm, 'nonsense')).toBe(0)
  })

  it('allowanceAt returns the tier allowance, or null for unlimited / non-metered', () => {
    expect(allowanceAt('space_crm', 'free')).toBe(FREE_CRM) // the free CRM allowance (ADR-552 Phase 3)
    expect(allowanceAt('space_crm', 'business')).toBeNull() // unlimited
    expect(allowanceAt('space_crm', 'nonprofit')).toBeNull() // maps to business rung (unlimited)
    expect(allowanceAt('space_whitelabel', 'free')).toBeNull() // not metered
  })
})

describe('the gauge as upsell — nearAllowanceLimit + the one shared nudge line (ADR-837)', () => {
  it('trips at the threshold (80% of a finite allowance) and not below it', () => {
    // Derived from the allowance, not restated: the nudge appears at exactly 80% and never a unit below.
    // This read "250 → the nudge at 200" until ADR-914 moved the allowance, at which point the numbers
    // still passed while measuring the wrong ratio. A test that hardcodes a config value is a second
    // source of truth for it.
    const eighty = Math.ceil(FREE_CRM * 0.8)
    expect(nearAllowanceLimit('space_crm', 'free', eighty - 1)).toBe(false)
    expect(nearAllowanceLimit('space_crm', 'free', eighty)).toBe(true)
    expect(nearAllowanceLimit('space_crm', 'free', 10_000)).toBe(true)
  })

  it('never trips on an unlimited tier, a zero allowance, or a non-metered feature', () => {
    expect(nearAllowanceLimit('space_crm', 'business', 1_000_000)).toBe(false) // unlimited
    expect(nearAllowanceLimit('space_automation', 'free', 5)).toBe(false) // zero allowance, nothing to fill
    expect(nearAllowanceLimit('space_whitelabel', 'free', 999)).toBe(false) // not metered
    expect(nearAllowanceLimit('made-up', 'free', 999)).toBe(false)
  })

  it('the nudge copy is on-canon: plain, no em dashes, no urgency or dark-pattern words', () => {
    expect(ALLOWANCE_NUDGE).toBe('Nearly full. Move up a plan for a higher allowance.')
    expect(ALLOWANCE_NUDGE).not.toMatch(/[–—]/)
    expect(ALLOWANCE_NUDGE.toLowerCase()).not.toMatch(/hurry|now|last chance|only|don't|warning|limit reached/)
  })
})

// ── THE WRITE SEAM + THE GRANDFATHER RULE (ADR-917, docs/VALUE-LADDER.md Phase 3b/Phase 8) ─────────
// The dark pattern this batch exists to forbid: a cap that walls someone BEHIND where they already
// stand. Production held a Space with 567 contacts against a published free allowance of 200 when
// this was written, and a bare cap would have refused it 367 contacts backwards.

describe('allowanceVerdict — the metered WRITE question, and the grandfather rule', () => {
  it('never enforces while the gates are not live, however far over the allowance', () => {
    for (const key of FEATURE_METER_KEYS) {
      const v = allowanceVerdict(key, 'free', Number.MAX_SAFE_INTEGER, { gatesLive: false })
      expect(v.allowed).toBe(true)
      expect(v.enforced).toBe(false)
    }
  })

  it('an unlimited tier and a non-metered key are never enforced', () => {
    expect(allowanceVerdict('space_crm', 'business', 10_000_000, { gatesLive: true }).allowed).toBe(true)
    expect(allowanceVerdict('space_whitelabel', 'free', 999, { gatesLive: true }).allowed).toBe(true)
    expect(allowanceVerdict('made-up', 'free', 999, { gatesLive: true }).allowed).toBe(true)
  })

  it('gates live: room below the cap, refused AT the cap (a write asks for ONE MORE)', () => {
    const under = allowanceVerdict('space_crm', 'free', FREE_CRM - 1, { gatesLive: true })
    expect(under.allowed).toBe(true)
    expect(under.remaining).toBe(1)
    const at = allowanceVerdict('space_crm', 'free', FREE_CRM, { gatesLive: true })
    expect(at.allowed).toBe(false)
    expect(at.remaining).toBe(0)
    // 🔴 The boundary that separates this from withinAllowance: FREE_CRM contacts is WITHIN a
    // FREE_CRM allowance and is simultaneously FULL. Both answers are right to their own question.
    expect(withinAllowance('space_crm', 'free', FREE_CRM, { gatesLive: true })).toBe(true)
  })

  it('🔴 THE GRANDFATHER RULE: the effective cap is never below the count already held', () => {
    // The real production case: 567 contacts on a plan whose published allowance is 200.
    const over = allowanceVerdict('space_crm', 'free', 567, { gatesLive: true })
    expect(over.allowance).toBe(FREE_CRM) // what the pricing page publishes, unchanged
    expect(over.effective).toBe(567) // what is actually applied: never below what they hold
    expect(over.grandfathered).toBe(true)
    // The cap governs GROWTH FROM TODAY. It is never retroactive, so `remaining` is never negative
    // and there is no reachable "delete 367 contacts to get back under the limit" state.
    expect(over.remaining).toBe(0)
    expect(over.allowed).toBe(false)
  })

  it('an explicitly granted floor widens the cap and can only ever be MORE generous', () => {
    const granted = allowanceVerdict('space_crm', 'free', 567, { gatesLive: true, floor: 1_000 })
    expect(granted.effective).toBe(1_000)
    expect(granted.allowed).toBe(true)
    expect(granted.remaining).toBe(433)
    // A floor BELOW the current count cannot narrow it (the grandfather rule wins).
    expect(allowanceVerdict('space_crm', 'free', 567, { gatesLive: true, floor: 10 }).effective).toBe(567)
  })

  it('garbage usage floors to 0 rather than inventing a refusal', () => {
    expect(allowanceVerdict('space_crm', 'free', Number.NaN, { gatesLive: true }).allowed).toBe(true)
    expect(allowanceVerdict('space_crm', 'free', -50, { gatesLive: true }).used).toBe(0)
  })

  it('allowanceHeadroom is the bulk form: a number, or null when nothing is enforced', () => {
    expect(allowanceHeadroom('space_crm', 'free', 10, { gatesLive: false })).toBeNull()
    expect(allowanceHeadroom('space_crm', 'business', 10, { gatesLive: true })).toBeNull()
    expect(allowanceHeadroom('space_crm', 'free', FREE_CRM - 5, { gatesLive: true })).toBe(5)
  })
})

describe('the enforcement seam — nothing charges / nothing hard-blocks while billing is off', () => {
  it('withinAllowance ALWAYS returns true while billing is off, even far over the allowance', () => {
    // Free CRM allowance is 200 contacts (ADR-914); 10x over it must still not be blocked while billing is off.
    expect(withinAllowance('space_crm', 'free', 1_000_000, { gatesLive: false })).toBe(true)
    // Every metered feature, at its free floor, wildly over allowance → still true (informational only).
    for (const key of FEATURE_METER_KEYS) {
      expect(withinAllowance(key, 'free', Number.MAX_SAFE_INTEGER, { gatesLive: false })).toBe(true)
    }
  })

  it('a non-metered or unknown feature is never blocked, even once billing is live', () => {
    expect(withinAllowance('space_whitelabel', 'free', 999, { gatesLive: true })).toBe(true)
    expect(withinAllowance('made-up', 'free', 999, { gatesLive: true })).toBe(true)
  })

  it('with billing LIVE it enforces the seam (usage vs allowance) — the go-live behavior', () => {
    // At/under the free cap passes; over it fails; an unlimited tier always passes.
    expect(withinAllowance('space_crm', 'free', FREE_CRM, { gatesLive: true })).toBe(true)
    expect(withinAllowance('space_crm', 'free', FREE_CRM + 1, { gatesLive: true })).toBe(false)
    expect(withinAllowance('space_crm', 'business', Number.MAX_SAFE_INTEGER, { gatesLive: true })).toBe(true)
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
