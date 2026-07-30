import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { FEATURE_GATES } from './gates'
import { PLACEHOLDER_METER_LIMITS, NON_METERED_FEATURES } from './feature-meters'

// ── THE DRIFT GUARD (Phase 3, docs/VALUE-LADDER.md · ADR-914) ───────────────────────────────────
//
// An audit of this repo found that the gate system is not the tier system. It is a SECOND, quieter
// opinion about the tier system: of 22 gates, 6 were enforced and 14 were decorative, while the limits
// that actually bit members were enforced by six separate parallel ladders that bypass featureAllowed
// entirely. The two opinions disagreed in ten places.
//
// Every one of those was invisible because nothing compared them. These tests are that comparison.
// They are deliberately mechanical and deliberately unkind: a decorative gate is a lie told in a
// comment, and a key that is both gated and metered is two different promises to the same customer.
//
// 🔴 HOW THE EXCEPTION LISTS WORK. Both lists below are RATCHETS. They exist because the debt was
// already here when the guard was written, and a guard that fails on day one gets deleted rather than
// fixed. They may only ever SHRINK. Adding a name to either is not a fix, it is a decision to ship the
// contradiction, and it needs a reason in this file that a future reader can argue with.

/** Keys that are BOTH gated and metered, pending resolution. Each is a real contradiction. */
const KNOWN_GATE_METER_COLLISIONS: Record<string, string> = {
  // The gate says a free Space gets NO CRM; the meter promises it 200 contacts. Today the meter's
  // promise wins vacuously (nothing counts contacts, so free Spaces get unlimited CRM) and at
  // gatesLive the gate wins and free Spaces lose the CRM the pricing page sold them.
  //
  // The resolution is the meter, per docs/VALUE-LADDER.md §3 — but it CANNOT ship until contacts are
  // actually counted. Deleting the gate first would replace an enforced limit with an unenforced one
  // and hand free Spaces unlimited CRM, which is strictly worse than the contradiction. Contacts are
  // written from more than twenty seams, so the counting seam is its own piece of work (Phase 3b).
  space_crm: 'Phase 3b: convert to a metered 200 contacts, once a counted write seam exists.',
  // Same shape. Resolution differs: the SENDS stay metered (300/mo free) and the CAMPAIGNS become the
  // wall, which `space_campaigns` now is. This row goes when the send meter is enforced and the
  // page-level gate can be dropped. Note the live cap today is neither published number: a flat
  // 500/day on every plan, which is ~15,000/mo, or 50x the published free allowance.
  space_email: 'Phase 3b: keep the send meter, drop the gate now that space_campaigns is the wall.',
  space_team: 'Phase 3b: the real cap is BASE_SEAT_ALLOWANCE; the meter and the gate are both mirrors of it.',
  space_multi_pipeline: 'Phase 3b: pick the meter, delete the gate. Only the pricing grid reads it.',
  space_crm_resonance_ai: 'Phase 3b: pick the meter; the gate wrapper has no callers.',
  space_automation: 'Phase 3b: the real lock is the pure `automation` entitlement key, not this gate.',
  space_collaborators: 'Phase 3b: the ladder is genuinely metered; the gate marks the free preview.',
  space_crm_playbooks: 'Phase 3b: the gate wrapper has no callers; the meter is display only.',
  // The personal Vera gate DOES enforce (usage-gate.ts), against an operator cap in pricing_settings
  // rather than against this meter. So the number a member is shown and the number they hit come from
  // two different places, which is the same drift in a quieter form.
  vera_unlimited: 'Phase 3b: the gate enforces against pricing_settings.vera_free_daily_cap, not this meter.',
}

/** Gates with no enforcement call site, pending wiring or deletion. */
const KNOWN_DECORATIVE_GATES: Record<string, string> = {
  space_crm_playbooks: 'spaceCanRunPlaybooksLive has zero callers. Wire it or delete it.',
  space_crm_resonance: 'spaceCanSeeResonanceLive has zero callers.',
  space_crm_resonance_ai: 'spaceCanUseResonanceAiLive has zero callers.',
  space_revenue_splits: 'Zero references outside gates.ts and docs. The feature is not built.',
  space_sms: 'Zero references outside gates.ts. Rides the A2P registration, which is not live.',
  journey_library_list: 'The real lock is canListJourneyInLibrary, a parallel ladder.',
  entry_points: 'The real cap is the hardcoded PLAN_CODE_CAPS map.',
  space_team: 'The real cap is BASE_SEAT_ALLOWANCE.',
  space_multi_pipeline: 'Referenced only by the pricing grid.',
  space_automation: 'The real lock is the pure `automation` entitlement key.',
  space_whitelabel: 'The real lock is the `whitelabel` entitlement key.',
  // Intentional and permanent: enforced by a PURE default-deny entitlement key precisely so it
  // survives featureAllowed short-circuiting to granted while the gates are not live. This is the one
  // row here that is correct rather than owed.
  space_full_website: 'INTENTIONAL — enforced by the pure spaceCanUseFullWebsite key, by design.',
}

const gateKeys = Object.keys(FEATURE_GATES)
const meterKeys = Object.keys(PLACEHOLDER_METER_LIMITS)

/** Does any non-test source file outside the pricing config itself reference this key? */
function referencedOutsideConfig(key: string): boolean {
  try {
    const out = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', key, 'app', 'lib', 'components'],
      { encoding: 'utf8' },
    )
    return out
      .split('\n')
      .filter(Boolean)
      .some((f) => !f.includes('.test.') && !f.startsWith('lib/pricing/'))
  } catch {
    return false // grep exits 1 on no match
  }
}

describe('no feature is both gated and metered', () => {
  it.each(gateKeys)('%s is a gate OR a meter, never both', (key) => {
    const collides = meterKeys.includes(key)
    if (!collides) return
    expect(
      KNOWN_GATE_METER_COLLISIONS[key],
      `🔴 ${key} is BOTH in FEATURE_GATES and PLACEHOLDER_METER_LIMITS. A gate says "not on your plan" ` +
        `and a meter says "you have N of them". Those are different promises and they will disagree the ` +
        `moment the gates go live. Pick one. If this genuinely cannot be resolved now, add ${key} to ` +
        `KNOWN_GATE_METER_COLLISIONS with a reason — but read the header first: that list is a ratchet.`,
    ).toBeTruthy()
  })

  it('the collision list only ever shrinks', () => {
    // Every listed key must STILL be a collision. A name that no longer collides has been fixed, and
    // leaving it here would let the next collision slip in under a stale exemption.
    for (const key of Object.keys(KNOWN_GATE_METER_COLLISIONS)) {
      const stillCollides = gateKeys.includes(key) && meterKeys.includes(key)
      expect(
        stillCollides,
        `${key} is exempted in KNOWN_GATE_METER_COLLISIONS but no longer collides. Delete the entry.`,
      ).toBe(true)
    }
  })

  it('records how much debt is left, so progress is visible', () => {
    // A number in a test is a worse tool than a list, but it is a much better tool than nothing: it
    // makes the remaining work countable and makes an increase impossible to land quietly.
    const collisions = gateKeys.filter((k) => meterKeys.includes(k))
    expect(collisions.length).toBeLessThanOrEqual(Object.keys(KNOWN_GATE_METER_COLLISIONS).length)
  })
})

describe('every gate is enforced somewhere, or admits it is not', () => {
  it.each(gateKeys)('%s has an enforcement call site', (key) => {
    if (referencedOutsideConfig(key)) return
    expect(
      KNOWN_DECORATIVE_GATES[key],
      `🔴 ${key} is declared in FEATURE_GATES and referenced NOWHERE outside lib/pricing. A gate with no ` +
        `call site does not gate anything — it is a promise in a comment, and it reads as enforced to ` +
        `everyone who finds it. Wire it or delete it.`,
    ).toBeTruthy()
  })

  it('the decorative list only ever shrinks', () => {
    for (const key of Object.keys(KNOWN_DECORATIVE_GATES)) {
      expect(
        gateKeys.includes(key),
        `${key} is exempted in KNOWN_DECORATIVE_GATES but is no longer a gate at all. Delete the entry.`,
      ).toBe(true)
    }
  })
})

describe('every gate is accounted for on the meter side', () => {
  it.each(gateKeys)('%s is metered or explicitly declared unmeterable', (key) => {
    const gate = FEATURE_GATES[key]!
    // A gate that cannot refuse anyone needs no allowance story: `enabled: false` never blocks, and a
    // floor at the bottom of its own ladder ('free') clears for everybody. Both are real states here —
    // space_full_website is deliberately disabled (a pure entitlement key enforces it instead) and
    // space_storefront is floored at free because a free Space can sell.
    if (!gate.enabled || gate.minEntitlement === 'free') return
    const accounted = key in PLACEHOLDER_METER_LIMITS || key in NON_METERED_FEATURES
    expect(
      accounted,
      `${key} is gated but neither metered nor listed in NON_METERED_FEATURES. Every gate must state ` +
        `whether it has a quantity, so the pricing surfaces can render it without guessing.`,
    ).toBe(true)
  })
})

describe('the walls are the three the strategy names, and nothing has crept in', () => {
  it('selling a membership is a wall at Business', () => {
    expect(FEATURE_GATES.space_memberships).toEqual({
      axis: 'plan',
      minEntitlement: 'business',
      enabled: true,
    })
    // 🔴 And it is UNMETERED above that wall. A cap on active members would tell a Space its eleventh
    // supporter cannot join, which punishes the customer for succeeding at the exact thing we asked
    // them to do. It carried a `free: 10 active members` allowance before ADR-914.
    expect(PLACEHOLDER_METER_LIMITS).not.toHaveProperty('space_memberships')
  })

  it('campaigns are a wall at Business, and sends stay metered', () => {
    expect(FEATURE_GATES.space_campaigns?.minEntitlement).toBe('business')
    // The distinction the wall encodes: messaging your own people is free (metered by sends), running
    // an acquisition machine is paid. If the send meter vanished, the wall would silently become
    // "a free Space cannot email anyone", which is not the deal.
    expect(PLACEHOLDER_METER_LIMITS.space_email?.free).toBeGreaterThan(0)
  })

  it('membership tickets sit WITH the membership they sell, not a tier above it', () => {
    // Gating memberships at Business and their own tickets at Collective sold half a feature.
    expect(FEATURE_GATES.space_membership_tickets?.minEntitlement).toBe(
      FEATURE_GATES.space_memberships?.minEntitlement,
    )
  })

  it('the free CRM allowance is the number the strategy publishes', () => {
    expect(PLACEHOLDER_METER_LIMITS.space_crm?.free).toBe(200)
  })

  it('🔴 selling is not gated anywhere on the map', () => {
    // The Phase 1 reversal, locked. These two keys held the wall that sent free Members to Venmo.
    expect(FEATURE_GATES).not.toHaveProperty('event_paid_tickets')
    expect(FEATURE_GATES).not.toHaveProperty('personal_payouts')
  })
})
