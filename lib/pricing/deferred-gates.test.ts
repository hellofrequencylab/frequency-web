import { describe, it, expect, vi } from 'vitest'

// DEFERRED PRICING GATES (ADR-370, docs/PRICING.md "Status & deferred", REMAINING-WORK #1-9). The
// headline invariant under test, end to end: OFF = everything allowed, exactly as before. Every gate
// wired in this batch is a NO-OP while billing_live is OFF. These cover the PURE halves + the
// OFF-invariant of the IO wrappers (with billing forced OFF, the way the test env already resolves it).

import { featureAllowed } from './gates'
import { resolveGamificationAccessWithFlags } from './gamification-access'
import { deriveGamificationAccess } from './gamification'
import { asHouseholdBundleConfig, HOUSEHOLD_BUNDLE_DEFAULT, householdBundlePriceKey, bundleSeatsRemaining } from './bundle'
import { asMemberPaymentState, prorationNote } from './dunning'
import { daysUntilSeasonReset, shouldNudgeBeforeReset, SEASON_RESET_NUDGE_DAYS } from './conversion'
import { featureKeyForFunction } from '@/lib/spaces/function-access'

// The seeded flag defaults (mirror lib/pricing/settings.ts FLAG_DEFAULTS): the per-role gamification
// flags reproduce today's derive-from-tier line (crew full, member earn_only). Two rungs, two flags —
// gamification_full_supporter left the list with the Supporter rung on 2026-08-24.
const SEEDED_FLAGS = {
  gamification_full_member: false,
  gamification_full_crew: true,
}

describe('REMAINING-WORK #5 — gamification_full standalone gate is INERT while billing OFF', () => {
  it('grants full gamification to EVERY tier while billing is not live (today behavior)', async () => {
    // The standalone gate routes through featureAllowed('gamification_full'), which short-circuits to
    // true while OFF — so a free member is NOT blocked, exactly as today.
    expect(await featureAllowed('gamification_full', { tier: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('gamification_full', { tier: 'crew' }, { gatesLive: false })).toBe(true)
  })

  it('ON: blocks free (earn-only), allows crew+ (the crew minimum)', async () => {
    expect(await featureAllowed('gamification_full', { tier: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('gamification_full', { tier: 'crew' }, { gatesLive: true })).toBe(true)
  })
})

describe('REMAINING-WORK #2 — resolveGamificationAccessWithFlags (the live consumer fold)', () => {
  it('with the seeded flags, returns EXACTLY the derive-from-tier line (today behavior)', () => {
    expect(resolveGamificationAccessWithFlags({ membership_tier: 'free' }, SEEDED_FLAGS)).toBe(
      deriveGamificationAccess('free'),
    )
    expect(resolveGamificationAccessWithFlags({ membership_tier: 'crew' }, SEEDED_FLAGS)).toBe(
      deriveGamificationAccess('crew'),
    )
    // An unrecognised label (the retired rung included) falls to the member flag then the pure
    // derive, which is earn_only. Nothing can hold that label: the column CHECKs to free/crew.
    expect(resolveGamificationAccessWithFlags({ membership_tier: 'supporter' }, SEEDED_FLAGS)).toBe('earn_only')
  })

  it('a per-profile override PINS access over the flags + tier', () => {
    expect(
      resolveGamificationAccessWithFlags({ membership_tier: 'free', gamification_access_override: 'full' }, SEEDED_FLAGS),
    ).toBe('full')
    expect(
      resolveGamificationAccessWithFlags({ membership_tier: 'crew', gamification_access_override: 'earn_only' }, SEEDED_FLAGS),
    ).toBe('earn_only')
  })

  it('a per-role flag elevates the derived default (comp a free member to full)', () => {
    expect(
      resolveGamificationAccessWithFlags({ membership_tier: 'free' }, { ...SEEDED_FLAGS, gamification_full_member: true }),
    ).toBe('full')
  })

  it('an unknown tier reads as free (earn_only) with the seeded flags', () => {
    expect(resolveGamificationAccessWithFlags({ membership_tier: 'nonsense' }, SEEDED_FLAGS)).toBe('earn_only')
    expect(resolveGamificationAccessWithFlags(null, SEEDED_FLAGS)).toBe('earn_only')
  })
})

describe('REMAINING-WORK #3 — vera_unlimited gate is INERT while billing OFF', () => {
  it('grants unlimited Vera to a free member while billing is not live (cap never bites)', async () => {
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { gatesLive: false })).toBe(true)
  })
  it('ON: a free member is gated (cap applies), crew+ is unlimited', async () => {
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('vera_unlimited', { tier: 'crew' }, { gatesLive: true })).toBe(true)
  })
})

describe('REMAINING-WORK #4 — space_* feature gates resolve consistently via featureAllowed', () => {
  it('maps the one remaining plan-gated function to its key; metered + universal functions map to null', () => {
    // 🔴 `crm` and `email` mapped to `space_crm` / `space_email` until ADR-917. They are METERED now,
    // not gated: a free Space really does get a CRM and really can email its own people, up to the
    // allowance the pricing page publishes. Enforcement moved to the counted write seams, so the
    // CORRECT answer here is null. Re-adding either mapping re-creates the contradiction Phase 3b
    // removed (a plan gate that takes the whole feature away instead of capping how much you use).
    expect(featureKeyForFunction('crm')).toBeNull()
    expect(featureKeyForFunction('email')).toBeNull()
    expect(featureKeyForFunction('shop')).toBe('space_storefront')
    expect(featureKeyForFunction('members')).toBeNull() // universal
    expect(featureKeyForFunction('made-up')).toBeNull()
  })

  it('OFF: every space_* feature is allowed regardless of plan (today behavior)', async () => {
    expect(await featureAllowed('space_memberships', { plan: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('space_campaigns', { plan: 'free' }, { gatesLive: false })).toBe(true)
  })

  it('ON: the collapsed plan ladder bites (the paid floor for space_* is business · ADR-552)', async () => {
    // The coarse plan-rank gate is now a single paid floor of 'business'; the fine per-feature gating is
    // the entitlement-key union (spaceHasEntitlement), not this ladder.
    expect(await featureAllowed('space_memberships', { plan: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('space_memberships', { plan: 'business' }, { gatesLive: true })).toBe(true)
    expect(await featureAllowed('space_campaigns', { plan: 'free' }, { gatesLive: true })).toBe(false)
    // A legacy label narrows to business through asSpacePlan inside the gate, so it still clears.
    expect(await featureAllowed('space_campaigns', { plan: 'pro' as never }, { gatesLive: true })).toBe(true)
  })
})

describe('REMAINING-WORK #6 — Household / Circle bundle config (pure)', () => {
  it('narrows a garbage config to the seeded default (fail-safe)', () => {
    expect(asHouseholdBundleConfig(null)).toEqual(HOUSEHOLD_BUNDLE_DEFAULT)
    expect(asHouseholdBundleConfig('nope')).toEqual(HOUSEHOLD_BUNDLE_DEFAULT)
    expect(asHouseholdBundleConfig({ seats: -3 }).seats).toBe(HOUSEHOLD_BUNDLE_DEFAULT.seats)
  })
  it('reads valid operator values', () => {
    const cfg = asHouseholdBundleConfig({ seats: 6, monthly_cents: 3000, annual_cents: 30000, tier: 'crew' })
    expect(cfg).toEqual({ seats: 6, monthly_cents: 3000, annual_cents: 30000, tier: 'crew' })
  })
  it('a bundle tier of the RETIRED Supporter rung fails safe to the seeded Crew tier', () => {
    // A bundle grants membership_tier to every seated member. profiles.membership_tier CHECKs to
    // exactly ('free','crew'), so a stored 'supporter' would have made the seating RPC reject the
    // whole bundle. Crew is the only grantable rung and the narrowing says so.
    expect(asHouseholdBundleConfig({ seats: 6, monthly_cents: 3000, annual_cents: 30000, tier: 'supporter' }).tier)
      .toBe(HOUSEHOLD_BUNDLE_DEFAULT.tier)
  })
  it('price keys + seats math', () => {
    expect(householdBundlePriceKey('monthly')).toBe('household_monthly')
    expect(householdBundlePriceKey('annual')).toBe('household_annual')
    expect(bundleSeatsRemaining({ ...HOUSEHOLD_BUNDLE_DEFAULT, seats: 4 }, 1)).toBe(3)
    expect(bundleSeatsRemaining({ ...HOUSEHOLD_BUNDLE_DEFAULT, seats: 4 }, 9)).toBe(0)
  })
})

describe('REMAINING-WORK #7 — dunning / proration (pure)', () => {
  it('an unwritten payment status reads as active (fail-safe, today behavior)', () => {
    expect(asMemberPaymentState(null)).toBe('active')
    expect(asMemberPaymentState(undefined)).toBe('active')
    expect(asMemberPaymentState('garbage')).toBe('active')
    expect(asMemberPaymentState('past_due')).toBe('past_due')
    expect(asMemberPaymentState('canceled')).toBe('canceled')
  })
  it('proration note: upgrade charges the difference, downgrade credits, same price is silent', () => {
    expect(prorationNote(900, 2400)).toContain('charged the difference')
    expect(prorationNote(2400, 900)).toContain('credit')
    expect(prorationNote(900, 900)).toBeNull()
  })
  it('proration note has no em or en dashes (CONTENT-VOICE)', () => {
    const note = prorationNote(900, 2400)
    expect(note).not.toMatch(/[–—]/)
  })
})

describe('REMAINING-WORK #8 — season-reset conversion timing (pure)', () => {
  const now = new Date('2026-06-23T00:00:00Z')
  it('days until reset (null when no end / past)', () => {
    expect(daysUntilSeasonReset(null, now)).toBeNull()
    expect(daysUntilSeasonReset('2026-06-22T00:00:00Z', now)).toBeNull() // past
    expect(daysUntilSeasonReset('2026-06-26T00:00:00Z', now)).toBe(3)
  })
  it('nudges only inside the window', () => {
    expect(shouldNudgeBeforeReset('2026-06-26T00:00:00Z', { now })).toBe(true) // 3 days, inside default 7
    expect(shouldNudgeBeforeReset('2026-07-20T00:00:00Z', { now })).toBe(false) // far out
    expect(shouldNudgeBeforeReset(null, { now })).toBe(false)
  })
  it('the default window is the documented value', () => {
    expect(SEASON_RESET_NUDGE_DAYS).toBe(7)
  })
})

// Belt-and-suspenders: the IO wrappers, with the GATES forced off, are no-ops. We force off by mocking
// featureGatesLive so the test never depends on env/DB, proving the OFF invariant of the wrappers
// directly. featureGatesLive() is false both before billing goes live AND during the beta grace window
// (ADR-874), so this covers the founder's "explore until Sept 1" window too.
describe('OFF invariant of the IO wrappers (feature gates forced off)', () => {
  it('gamificationFullAllowed returns true (grant) for every tier while the gates are off', async () => {
    vi.resetModules()
    vi.doMock('./settings', async () => {
      const actual = await vi.importActual<typeof import('./settings')>('./settings')
      return { ...actual, featureGatesLive: async () => false }
    })
    const { gamificationFullAllowed } = await import('./gamification-access')
    expect(await gamificationFullAllowed('free')).toBe(true)
    expect(await gamificationFullAllowed('crew')).toBe(true)
    vi.doUnmock('./settings')
    vi.resetModules()
  })

  it('veraDailyCapReached returns false (never capped) for a free member while the gates are off', async () => {
    vi.resetModules()
    vi.doMock('./settings', async () => {
      const actual = await vi.importActual<typeof import('./settings')>('./settings')
      return { ...actual, featureGatesLive: async () => false }
    })
    const { veraDailyCapReached } = await import('@/lib/ai/vera/usage-gate')
    expect(await veraDailyCapReached('profile-1', 'free')).toBe(false)
    vi.doUnmock('./settings')
    vi.resetModules()
  })
})
