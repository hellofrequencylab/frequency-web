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
// flags reproduce today's derive-from-tier line (crew/supporter full, member earn_only).
const SEEDED_FLAGS = {
  gamification_full_member: false,
  gamification_full_crew: true,
  gamification_full_supporter: true,
}

describe('REMAINING-WORK #5 — gamification_full standalone gate is INERT while billing OFF', () => {
  it('grants full gamification to EVERY tier while billing is not live (today behavior)', async () => {
    // The standalone gate routes through featureAllowed('gamification_full'), which short-circuits to
    // true while OFF — so a free member is NOT blocked, exactly as today.
    expect(await featureAllowed('gamification_full', { tier: 'free' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('gamification_full', { tier: 'crew' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('gamification_full', { tier: 'supporter' }, { billingLive: false })).toBe(true)
  })

  it('ON: blocks free (earn-only), allows crew+ (the crew minimum)', async () => {
    expect(await featureAllowed('gamification_full', { tier: 'free' }, { billingLive: true })).toBe(false)
    expect(await featureAllowed('gamification_full', { tier: 'crew' }, { billingLive: true })).toBe(true)
    expect(await featureAllowed('gamification_full', { tier: 'supporter' }, { billingLive: true })).toBe(true)
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
    expect(resolveGamificationAccessWithFlags({ membership_tier: 'supporter' }, SEEDED_FLAGS)).toBe('full')
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
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { billingLive: false })).toBe(true)
  })
  it('ON: a free member is gated (cap applies), crew+ is unlimited', async () => {
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { billingLive: true })).toBe(false)
    expect(await featureAllowed('vera_unlimited', { tier: 'crew' }, { billingLive: true })).toBe(true)
  })
})

describe('REMAINING-WORK #4 — space_* feature gates resolve consistently via featureAllowed', () => {
  it('maps plan-gated functions to their pricing feature key; universal functions map to null', () => {
    expect(featureKeyForFunction('crm')).toBe('space_crm')
    expect(featureKeyForFunction('email')).toBe('space_email')
    expect(featureKeyForFunction('members')).toBeNull() // universal
    expect(featureKeyForFunction('made-up')).toBeNull()
  })

  it('OFF: every space_* feature is allowed regardless of plan (today behavior)', async () => {
    expect(await featureAllowed('space_crm', { plan: 'free' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('space_email', { plan: 'free' }, { billingLive: false })).toBe(true)
  })

  it('ON: the collapsed plan ladder bites (the paid floor for space_* is business · ADR-552)', async () => {
    // The coarse plan-rank gate is now a single paid floor of 'business'; the fine per-feature gating is
    // the entitlement-key union (spaceHasEntitlement), not this ladder.
    expect(await featureAllowed('space_crm', { plan: 'free' }, { billingLive: true })).toBe(false)
    expect(await featureAllowed('space_crm', { plan: 'business' }, { billingLive: true })).toBe(true)
    expect(await featureAllowed('space_email', { plan: 'free' }, { billingLive: true })).toBe(false)
    // A legacy label narrows to business through asSpacePlan inside the gate, so it still clears.
    expect(await featureAllowed('space_email', { plan: 'pro' as never }, { billingLive: true })).toBe(true)
  })
})

describe('REMAINING-WORK #6 — Household / Circle bundle config (pure)', () => {
  it('narrows a garbage config to the seeded default (fail-safe)', () => {
    expect(asHouseholdBundleConfig(null)).toEqual(HOUSEHOLD_BUNDLE_DEFAULT)
    expect(asHouseholdBundleConfig('nope')).toEqual(HOUSEHOLD_BUNDLE_DEFAULT)
    expect(asHouseholdBundleConfig({ seats: -3 }).seats).toBe(HOUSEHOLD_BUNDLE_DEFAULT.seats)
  })
  it('reads valid operator values', () => {
    const cfg = asHouseholdBundleConfig({ seats: 6, monthly_cents: 3000, annual_cents: 30000, tier: 'supporter' })
    expect(cfg).toEqual({ seats: 6, monthly_cents: 3000, annual_cents: 30000, tier: 'supporter' })
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

// Belt-and-suspenders: the IO wrappers, with billing forced OFF, are no-ops. We force OFF by mocking
// billingLive so the test never depends on env/DB, proving the OFF invariant of the wrappers directly.
describe('OFF invariant of the IO wrappers (billing forced OFF)', () => {
  it('gamificationFullAllowed returns true (grant) for every tier while OFF', async () => {
    vi.resetModules()
    vi.doMock('./settings', async () => {
      const actual = await vi.importActual<typeof import('./settings')>('./settings')
      return { ...actual, billingLive: async () => false }
    })
    const { gamificationFullAllowed } = await import('./gamification-access')
    expect(await gamificationFullAllowed('free')).toBe(true)
    expect(await gamificationFullAllowed('crew')).toBe(true)
    vi.doUnmock('./settings')
    vi.resetModules()
  })

  it('veraDailyCapReached returns false (never capped) for a free member while OFF', async () => {
    vi.resetModules()
    vi.doMock('./settings', async () => {
      const actual = await vi.importActual<typeof import('./settings')>('./settings')
      return { ...actual, billingLive: async () => false }
    })
    const { veraDailyCapReached } = await import('@/lib/ai/vera/usage-gate')
    expect(await veraDailyCapReached('profile-1', 'free')).toBe(false)
    vi.doUnmock('./settings')
    vi.resetModules()
  })
})
