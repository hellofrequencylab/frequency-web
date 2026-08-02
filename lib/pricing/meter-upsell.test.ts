import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  PLACEHOLDER_METER_LIMITS,
  USAGE_UPGRADE_THRESHOLD,
  featureMeter,
} from './feature-meters'
import { PRICING_DEFAULTS } from './settings'
import {
  buildMeterUpsell,
  meterRateBps,
  METER_UPSELL_PROMISE,
  METER_UPSELL_SURFACES,
  meterUpsellSurface,
  unmountedMeterKeys,
  type MeterRateLadder,
} from './meter-upsell'

// ── THE PHASE 4 VISIBILITY GUARD (docs/VALUE-LADDER.md §5 Phase 4 "done when") ──────────────────
//
// The measured failure this file exists to prevent: an audit found 17 of 22 meters with no in-context
// upsell surface, including ALL SIX tier-axis meters, because the Space plan hub filters to
// `axis === 'plan'` and the member upgrade page mounted no meter component at all. Every one of those
// was invisible for exactly one reason: nothing compared the meter map to the surfaces.
//
// So the registry is not documentation, it is a contract, and these tests are deliberately unkind to
// it. A row cannot be satisfied by typing a plausible filename: the file must exist, an 'in-context'
// row's file must literally reference the feature key, and a 'ladder' row's file must mount the
// axis-wide ladder FOR THAT AXIS. A registry that can be satisfied by a lie is worse than none,
// because it converts an obvious gap into a passing test.

const meterKeys = Object.keys(PLACEHOLDER_METER_LIMITS)
const rates: MeterRateLadder = PRICING_DEFAULTS.take_rate

/** The mount file's source, or null when the path does not exist. */
function mountSource(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}

describe('every metered feature has a registered upsell surface', () => {
  it('has at least one meter to check (the guard is not vacuous)', () => {
    expect(meterKeys.length).toBeGreaterThan(15)
  })

  it('every PLACEHOLDER_METER_LIMITS key appears in METER_UPSELL_SURFACES', () => {
    // The Phase 4 "done when", stated exactly: a new meter cannot ship invisible.
    expect(unmountedMeterKeys()).toEqual([])
  })

  it('registers no surface for a key that is not a meter (no stale rows)', () => {
    const stale = Object.keys(METER_UPSELL_SURFACES).filter((k) => !PLACEHOLDER_METER_LIMITS[k])
    expect(stale).toEqual([])
  })

  it.each(meterKeys)('%s: its mount file exists on disk', (key) => {
    const surface = meterUpsellSurface(key)!
    expect(surface, `no registry row for ${key}`).toBeTruthy()
    expect(mountSource(surface.mount), `${key}: missing mount file ${surface.mount}`).not.toBeNull()
  })

  it.each(meterKeys)('%s: the mount actually renders this meter', (key) => {
    const surface = meterUpsellSurface(key)!
    const src = mountSource(surface.mount)!
    if (surface.kind === 'in-context') {
      // A dedicated surface names the key, so the mount is greppable from the key alone.
      expect(src, `${surface.mount} never mentions ${key}`).toContain(key)
    } else {
      // A ladder surface iterates the meter map, filtered to THIS meter's axis. Both halves matter:
      // the plan hub carries no tier meter, and the member upgrade page carries no plan meter, so a
      // row that points a tier meter at the plan hub is a gap wearing a registry entry.
      const axis = featureMeter(key)!.axis
      expect(src, `${surface.mount} does not iterate FEATURE_METERS`).toContain('FEATURE_METERS')
      expect(src, `${surface.mount} does not filter to the ${axis} axis`).toContain(`axis === '${axis}'`)
    }
  })

  it('every registry row carries a reason a future reader can argue with', () => {
    for (const [key, surface] of Object.entries(METER_UPSELL_SURFACES)) {
      expect(surface.note.length, `${key}: empty note`).toBeGreaterThan(20)
    }
  })

  it('both axes are covered by a real ladder mount, not only in-context prompts', () => {
    const byAxis = (axis: string) =>
      meterKeys.filter((k) => featureMeter(k)?.axis === axis && METER_UPSELL_SURFACES[k]?.kind === 'ladder')
    expect(byAxis('plan').length).toBeGreaterThan(0)
    // The Phase 4 headline: all six tier meters were total gaps. Every one now lands on a ladder mount.
    expect(byAxis('tier').length).toBe(meterKeys.filter((k) => featureMeter(k)?.axis === 'tier').length - 1)
  })
})

describe('the 80% goal-gradient threshold', () => {
  it('says nothing below the threshold', () => {
    // 199 of 200 would be a wall prompt; 100 of 200 is 50%, well under the gradient.
    const copy = buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'free', usage: 100, rates })
    expect(copy).toBeNull()
  })

  it('speaks exactly at the threshold, not only at the cap', () => {
    const at = Math.ceil(200 * USAGE_UPGRADE_THRESHOLD)
    expect(buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'free', usage: at, rates })).not.toBeNull()
    expect(buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'free', usage: at - 1, rates })).toBeNull()
  })

  it('says nothing on an unlimited rung (there is nothing to fill)', () => {
    expect(
      buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'business', usage: 500_000, rates }),
    ).toBeNull()
  })

  it('says nothing on a zero allowance (a wall is not a meter)', () => {
    expect(
      buildMeterUpsell({ featureKey: 'space_collaborators', currentTier: 'free', usage: 5, rates }),
    ).toBeNull()
  })

  it('says nothing for a key with no meter', () => {
    expect(buildMeterUpsell({ featureKey: 'space_memberships', currentTier: 'free', usage: 99, rates })).toBeNull()
    expect(buildMeterUpsell({ featureKey: 'not_a_feature', currentTier: 'free', usage: 99, rates })).toBeNull()
  })
})

describe('the copy rules', () => {
  const crm = buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'free', usage: 187, rates })!

  it('names what the member ALREADY HAS, with their real number', () => {
    expect(crm.have).toContain('187')
    expect(crm.have).toMatch(/^You have 187 contacts\./)
  })

  it('never names what the member lacks', () => {
    const all = [crm.have, crm.change, crm.promise].join(' ').toLowerCase()
    for (const word of ['locked', 'lock', 'you cannot', 'you can not', "you can't", 'upgrade to unlock', 'blocked']) {
      expect(all, `copy says "${word}"`).not.toContain(word)
    }
  })

  it('names the RATE improvement as well as the cap lift', () => {
    // The cap lift.
    expect(crm.change).toContain('unlimited')
    // The rate, both rungs, read from config (free 10% -> Business 5%).
    expect(crm.change).toContain('network-sourced')
    expect(crm.change).toContain(`${PRICING_DEFAULTS.take_rate.network_bps.free / 100}%`)
    expect(crm.change).toContain(`${PRICING_DEFAULTS.take_rate.network_bps.business / 100}%`)
  })

  it('names the rate on the PERSONAL axis too (free Member 10% -> Crew 8%)', () => {
    const circles = buildMeterUpsell({ featureKey: 'circle_host', currentTier: 'free', usage: 1, rates })!
    expect(circles.change).toContain(`${PRICING_DEFAULTS.take_rate.member_free_bps / 100}%`)
    expect(circles.change).toContain(`${PRICING_DEFAULTS.take_rate.member_bps / 100}%`)
  })

  it('drops the rate clause rather than inventing one when the rate does not move', () => {
    const flat: MeterRateLadder = {
      network_bps: { ...rates.network_bps, business: rates.network_bps.free! },
      member_free_bps: rates.member_free_bps,
      member_bps: rates.member_bps,
    }
    const copy = buildMeterUpsell({ featureKey: 'space_crm', currentTier: 'free', usage: 187, rates: flat })!
    expect(copy.change).not.toContain('network-sourced')
    expect(copy.change).toContain('unlimited')
  })

  it('promises 0% on your own people and never hints at deletion', () => {
    expect(crm.promise).toBe(METER_UPSELL_PROMISE)
    expect(METER_UPSELL_PROMISE).toContain('0% on every plan')
    for (const word of ['delete', 'deleted', 'removed', 'lose', 'lost', 'expire']) {
      expect(METER_UPSELL_PROMISE.toLowerCase(), `promise says "${word}"`).not.toContain(word)
    }
  })

  it('runs no dark pattern: no countdown, no scarcity, no invented seats', () => {
    for (const key of meterKeys) {
      const ladder = featureMeter(key)
      const free = ladder?.steps[0]
      if (!ladder || !free || free.allowance == null || free.allowance <= 0) continue
      const copy = buildMeterUpsell({ featureKey: key, currentTier: free.tier, usage: free.allowance, rates })
      if (!copy) continue
      const all = [copy.have, copy.change, copy.promise].join(' ').toLowerCase()
      for (const word of ['hurry', 'act now', 'only ', 'left', 'expires', 'last chance', 'spots', 'running out']) {
        expect(all, `${key}: copy says "${word}"`).not.toContain(word)
      }
    }
  })

  it('uses no em dash anywhere in the copy (CONTENT-VOICE §10)', () => {
    for (const key of meterKeys) {
      const ladder = featureMeter(key)
      const free = ladder?.steps[0]
      if (!ladder || !free || free.allowance == null || free.allowance <= 0) continue
      const copy = buildMeterUpsell({ featureKey: key, currentTier: free.tier, usage: free.allowance, rates })
      if (!copy) continue
      expect([copy.have, copy.change, copy.promise].join(' '), `${key}`).not.toContain('—')
    }
  })

  it('agrees in number with the count (the caps here really are 1 and 2)', () => {
    // Measured, not assumed: this read "You have 1 seats" until the real output was printed. Half the
    // free allowances in PLACEHOLDER_METER_LIMITS are 1, so the singular is the common case here.
    const seats = buildMeterUpsell({ featureKey: 'space_team', currentTier: 'free', usage: 1, rates })!
    expect(seats.have).toContain('1 seat.')
    expect(seats.have).not.toContain('1 seats')
    const circles = buildMeterUpsell({ featureKey: 'circle_host', currentTier: 'free', usage: 1, rates })!
    expect(circles.have).toContain('1 circle.')
    // And the plural survives above one.
    const events = buildMeterUpsell({ featureKey: 'event_create', currentTier: 'free', usage: 2, rates })!
    expect(events.have).toContain('2 events')
  })

  it('steps OVER a flat rung to the next one that is really more room', () => {
    // space_team runs free 1 -> business 1 -> collective 3. Business repeats what a free Space already
    // has, so walking one rung and giving up told a member at their seat limit nothing at all, even
    // though Collective genuinely offers three. A rung with nothing to say is not the top of the ladder.
    const seats = buildMeterUpsell({ featureKey: 'space_team', currentTier: 'free', usage: 1, rates })
    expect(seats, 'a flat middle rung must not silence the whole ladder').not.toBeNull()
    expect(seats!.nextLabel).toBe('Collective')
    expect(seats!.change).toContain('3')
  })

  it('still says nothing when every remaining rung repeats what they have', () => {
    // The honest silence this function is built around has to survive the skip: stepping over flat
    // rungs must find a BETTER one, never merely a later one.
    const top = buildMeterUpsell({ featureKey: 'space_team', currentTier: 'collective', usage: 3, rates })
    expect(top).toBeNull()
  })

  it('states a metered flow with its period, not as a standing count', () => {
    const email = buildMeterUpsell({ featureKey: 'space_email', currentTier: 'free', usage: 280, rates })!
    expect(email.have).toContain('this month')
    expect(email.change).toContain('a month')
  })
})

describe('meterRateBps', () => {
  it('reads the per-plan vector on the plan axis', () => {
    expect(meterRateBps('plan', 'free', rates)).toBe(PRICING_DEFAULTS.take_rate.network_bps.free)
    expect(meterRateBps('plan', 'collective', rates)).toBe(PRICING_DEFAULTS.take_rate.network_bps.collective)
  })

  it('reads the two member rungs on the tier axis', () => {
    expect(meterRateBps('tier', 'free', rates)).toBe(PRICING_DEFAULTS.take_rate.member_free_bps)
    expect(meterRateBps('tier', 'crew', rates)).toBe(PRICING_DEFAULTS.take_rate.member_bps)
  })

  it('returns null for an unknown plan rather than guessing', () => {
    expect(meterRateBps('plan', 'not_a_plan', rates)).toBeNull()
  })
})
