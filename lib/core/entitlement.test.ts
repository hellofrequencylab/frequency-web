import { describe, it, expect } from 'vitest'
import {
  deriveTier,
  isPaid,
  ENTITLEMENT_TIERS,
  ENTITLEMENT_LABEL,
  resolveEffectiveTier,
  billedTier,
  isEffectiveTier,
} from '@/lib/core/entitlement'
import { accessTo } from '@/lib/core/access-matrix'

// THE ENTITLEMENT LADDER HAS EXACTLY TWO RUNGS: Member (free) and Crew (paid).
//
// The Supporter rung was retired on 2026-08-24 (owner directive closing the ADR-458 drop condition,
// on top of ADR-878 which had already taken it off the sellable ladder). It left the EntitlementTier
// union, ENTITLEMENT_TIERS, ENTITLEMENT_LABEL and the isPaid matrix, and the read-time
// `supporter -> crew` fold in deriveTier went with it.
//
// The fold was safe to remove because its drop condition was MEASURED, not assumed: migration
// 20260915000100 narrowed profiles.membership_tier to CHECK (membership_tier in ('free','crew')) and
// remapped every row, and the live column carries zero of the retired label across 56 profiles.
//
// SEPARATE THING, DELIBERATELY UNTOUCHED: the Supporter BADGE (profiles.is_supporter), the
// pay-what-you-want contribution mark. lib/billing/supporter.test.ts covers it. Retiring a rung is
// not retiring a way to give.

describe('deriveTier', () => {
  it('returns the billing flag, defaulting to free', () => {
    expect(deriveTier('free')).toBe('free')
    expect(deriveTier('crew')).toBe('crew')
    expect(deriveTier(null)).toBe('free')
    expect(deriveTier(undefined)).toBe('free')
  })

})

describe('the ladder is exactly two rungs (Supporter retired, 2026-08-24)', () => {
  it('ENTITLEMENT_TIERS is [free, crew], in ascending order', () => {
    expect([...ENTITLEMENT_TIERS]).toEqual(['free', 'crew'])
  })

  it('ENTITLEMENT_LABEL carries a label for each rung and nothing else', () => {
    expect(Object.keys(ENTITLEMENT_LABEL).sort()).toEqual(['crew', 'free'])
    expect(ENTITLEMENT_LABEL).not.toHaveProperty('supporter')
    // No surface can render the retired name off this map.
    expect(Object.values(ENTITLEMENT_LABEL)).not.toContain('Supporter')
  })

  it('the retired label is no longer a rung anywhere on the ladder', () => {
    // A string cast, because it is not representable through the type any more — which is the
    // point: the compiler is the first gate and this is the second.
    const retired = 'supporter' as unknown as 'free'
    expect(ENTITLEMENT_TIERS).not.toContain(retired)
    expect(isPaid(retired)).toBe(false)
  })
})

describe('isPaid', () => {
  it('Crew is the one paid rung; free is not', () => {
    expect(isPaid('free')).toBe(false)
    expect(isPaid('crew')).toBe(true)
    expect(isPaid(null)).toBe(false)
    expect(isPaid(undefined)).toBe(false)
  })
})

// 🔴 `canCashIn` AND ITS THREE TESTS ARE GONE (ADR-1295, owner ruling 2026-09-09, OWN-071). The
// predicate answered "may this tier spend Gems / claim Vault rewards", and the answer is now yes for
// every signed-in member. What replaces the tests is the assertion below: the Vault stopped being a
// paid row of the access matrix in the same change, so nothing is left claiming spending is a rung.
describe('the Vault is a Quest surface, not a paid one (ADR-1295)', () => {
  it('a free member has FULL access to the Vault, same as every other Quest surface', () => {
    for (const tier of ENTITLEMENT_TIERS) {
      expect(accessTo('vault', { loggedIn: true, role: 'member', tier })).toBe('full')
    }
    // It tracks its four siblings exactly. If someone puts the Vault back on PAID_FULL, this fails.
    for (const surface of ['quest', 'journeys', 'practices', 'library'] as const) {
      expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'free' })).toBe(
        accessTo(surface, { loggedIn: true, role: 'member', tier: 'free' }),
      )
    }
  })

  it('a visitor still only previews it (browsing is open, playing needs an account)', () => {
    expect(accessTo('vault', { loggedIn: false })).toBe('limited')
  })
})

// ── GRANTED CREW: the union, and the wall between access and money (LIVE-223 / LIVE-224) ────────
//
// Crew is now also GRANTED by an active paid community membership. The grant lives in its own
// provenance-stamped row (public.entitlement_grants), so the effective tier is a union of two
// independently revocable facts. The pure half of that resolution lives here; the DB half is
// lib/billing/crew-grants.test.ts, and the take-rate wall is lib/billing/granted-crew-take-rate.test.ts.

describe('resolveEffectiveTier: stripe_active OR EXISTS(active grant)', () => {
  it('a free member with no grant is free', () => {
    expect(resolveEffectiveTier('free', false)).toEqual({
      stripeTier: 'free',
      granted: false,
      tier: 'free',
    })
  })

  it('a free member WITH an active grant reads as crew', () => {
    expect(resolveEffectiveTier('free', true)).toEqual({
      stripeTier: 'free',
      granted: true,
      tier: 'crew',
    })
  })

  it('a Stripe crew is crew with or without a grant - the grant only ever RAISES', () => {
    expect(resolveEffectiveTier('crew', false).tier).toBe('crew')
    expect(resolveEffectiveTier('crew', true).tier).toBe('crew')
    // ...and revoking the grant cannot take away what they bought.
    expect(resolveEffectiveTier('crew', false).stripeTier).toBe('crew')
  })

  it('null / undefined / unknown labels default to free, and a grant still lifts them', () => {
    expect(resolveEffectiveTier(null, false).tier).toBe('free')
    expect(resolveEffectiveTier(undefined, false).tier).toBe('free')
    expect(resolveEffectiveTier('platinum', false).tier).toBe('platinum')
    expect(resolveEffectiveTier('platinum', false).tier).not.toBe('crew')
    expect(resolveEffectiveTier(null, true).tier).toBe('crew')
  })

  it('only a real boolean true is a grant (a truthy accident is not)', () => {
    expect(resolveEffectiveTier('free', 1 as unknown as boolean).tier).toBe('free')
    expect(resolveEffectiveTier('free', 'yes' as unknown as boolean).tier).toBe('free')
  })
})

describe('billedTier: the rung money reads', () => {
  it('collapses an EffectiveTier to its STRIPE rung, never its resolved tier', () => {
    const granted = resolveEffectiveTier('free', true)
    expect(granted.tier).toBe('crew')
    expect(billedTier(granted)).toBe('free')
    expect(isPaid(billedTier(granted))).toBe(false)
  })

  it('passes a bare tier string through exactly like deriveTier', () => {
    for (const raw of ['free', 'crew', 'platinum', null, undefined]) {
      expect(billedTier(raw)).toBe(deriveTier(raw as never))
    }
  })

  it('a Stripe crew bills as crew', () => {
    expect(billedTier(resolveEffectiveTier('crew', true))).toBe('crew')
    expect(isPaid(billedTier(resolveEffectiveTier('crew', true)))).toBe(true)
  })

  it('isEffectiveTier tells a record from a string', () => {
    expect(isEffectiveTier(resolveEffectiveTier('free', true))).toBe(true)
    expect(isEffectiveTier('crew')).toBe(false)
    expect(isEffectiveTier(null)).toBe(false)
    expect(isEffectiveTier({ tier: 'crew' })).toBe(false) // no stripeTier: not the record
  })
})
