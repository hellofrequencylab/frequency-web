// A GRANTED CREW MUST NOT BUY DOWN THE TAKE RATE (LIVE-224).
//
// THE HOLE THIS CLOSES. Under the new model Crew is granted by an active paid community membership
// (LIVE-223): pay a Space's dues, get the member tier. Crew also takes the member NETWORK take rate
// from 10% to 8%. Put those two facts together carelessly and a $1/month membership tier is a
// machine: the buyer pays a dollar, inherits the 8% rung, and every network sale they make after
// that is 2% cheaper. On any real sales volume the grant pays for itself and then some, and the
// platform ends up funding the discount on a rate nobody negotiated.
//
// THE GUARD. `memberNetworkTakeRateBps` reads the STRIPE tier (`profiles.membership_tier`) and never
// the resolved effective tier. Access resolves as `stripe_active OR EXISTS(active grant)`; money
// resolves as `stripe_active` alone. Those two answers are deliberately different, and this file is
// where that difference is pinned.
//
// Four things are locked here:
//   1. A Stripe-paying Crew gets the 8% rung.  (The discount is real for people who bought it.)
//   2. A GRANTED Crew gets the 10% rung.       (The discount is not for people who were given it.)
//   3. Cancelling the membership revokes the grant, and the seller is back to plain free-tier.
//   4. SOURCE SHAPE: the pricing function narrows through `billedTier`, so a future refactor that
//      swaps in the effective tier fails HERE rather than in a month of quiet under-collection.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  memberNetworkTakeRateBps,
  sourceAwareMemberTakeRateCents,
  NETWORK_TAKE_RATE_DEFAULT,
} from './pricing-keys'
import { resolveEffectiveTier, billedTier, isPaid } from '@/lib/core/entitlement'

/** The two published rungs, read from the seeded rate so this test tracks the ladder, not a copy. */
const CREW_BPS = NETWORK_TAKE_RATE_DEFAULT.member // 800 = 8%
const FREE_BPS = NETWORK_TAKE_RATE_DEFAULT.memberFree // 1000 = 10%

/** A seller who pays Stripe for Crew: the column says crew, no grant involved. */
const stripeCrew = resolveEffectiveTier('crew', false)

/** A seller who is Crew ONLY because a paid community membership granted it. */
const grantedCrew = resolveEffectiveTier('free', true)

/** The same seller a moment after cancelling that membership: the grant row is gone. */
const cancelledGrant = resolveEffectiveTier('free', false)

describe('the two tiers are genuinely different facts', () => {
  it('a granted Crew has full ACCESS as crew', () => {
    expect(grantedCrew.tier).toBe('crew')
    expect(isPaid(grantedCrew.tier)).toBe(true)
    expect(grantedCrew.granted).toBe(true)
  })

  it('...but its BILLED rung is still free', () => {
    expect(grantedCrew.stripeTier).toBe('free')
    expect(billedTier(grantedCrew)).toBe('free')
  })

  it('a Stripe-paying Crew is crew on both axes and carries no grant', () => {
    expect(stripeCrew.tier).toBe('crew')
    expect(stripeCrew.stripeTier).toBe('crew')
    expect(stripeCrew.granted).toBe(false)
    expect(billedTier(stripeCrew)).toBe('crew')
  })
})

describe('the take rate reads the Stripe tier, never the grant', () => {
  it('a Stripe-paying Crew gets 8%', () => {
    expect(memberNetworkTakeRateBps('crew')).toBe(CREW_BPS)
    expect(memberNetworkTakeRateBps(stripeCrew)).toBe(CREW_BPS)
    expect(CREW_BPS).toBe(800)
  })

  it('a GRANTED Crew gets 10% - the grant does not buy the rate down', () => {
    expect(memberNetworkTakeRateBps(grantedCrew)).toBe(FREE_BPS)
    expect(FREE_BPS).toBe(1000)
    // The inversion this test exists to catch: reading the resolved tier instead of the billed one.
    expect(memberNetworkTakeRateBps(grantedCrew.tier)).toBe(CREW_BPS)
    expect(memberNetworkTakeRateBps(grantedCrew)).not.toBe(
      memberNetworkTakeRateBps(grantedCrew.tier),
    )
  })

  it('cancelling the membership revokes the grant and nothing about the rate changes', () => {
    // The grant is a ROW; revoke deletes it, so "cancelled" is simply hasActiveGrant === false.
    expect(cancelledGrant.tier).toBe('free')
    expect(cancelledGrant.granted).toBe(false)
    expect(memberNetworkTakeRateBps(cancelledGrant)).toBe(FREE_BPS)
    // ...and the seller was never on the 8% rung to be dropped from, which is the whole point:
    // revoking a grant cannot claw back a discount that was never given.
    expect(memberNetworkTakeRateBps(grantedCrew)).toBe(memberNetworkTakeRateBps(cancelledGrant))
  })

  it('a Stripe-paying Crew is NEVER downgraded by grant logic', () => {
    // Grant present or absent, bought is bought.
    expect(memberNetworkTakeRateBps(resolveEffectiveTier('crew', true))).toBe(CREW_BPS)
    expect(memberNetworkTakeRateBps(resolveEffectiveTier('crew', false))).toBe(CREW_BPS)
    expect(resolveEffectiveTier('crew', true).tier).toBe('crew')
  })
})

describe('the money that actually moves', () => {
  const GROSS = 10_000 // a $100 network sale

  it('charges $8 to a Stripe Crew and $10 to a granted Crew', () => {
    expect(
      sourceAwareMemberTakeRateCents(GROSS, 'network', NETWORK_TAKE_RATE_DEFAULT, stripeCrew),
    ).toBe(800)
    expect(
      sourceAwareMemberTakeRateCents(GROSS, 'network', NETWORK_TAKE_RATE_DEFAULT, grantedCrew),
    ).toBe(1000)
  })

  it('still charges nothing on a self-sourced sale, for either', () => {
    expect(
      sourceAwareMemberTakeRateCents(GROSS, 'self', NETWORK_TAKE_RATE_DEFAULT, stripeCrew),
    ).toBe(0)
    expect(
      sourceAwareMemberTakeRateCents(GROSS, 'self', NETWORK_TAKE_RATE_DEFAULT, grantedCrew),
    ).toBe(0)
  })

  it('a $1 membership tier cannot pay for itself out of the take rate', () => {
    // The scenario in one assertion: a member pays 100c of dues, then sells $100 on the network.
    // If the grant bought the rate down they would save 200c on that one sale alone.
    const duesCents = 100
    const paid = sourceAwareMemberTakeRateCents(
      GROSS,
      'network',
      NETWORK_TAKE_RATE_DEFAULT,
      grantedCrew,
    )
    const ifTheGrantLeaked = sourceAwareMemberTakeRateCents(
      GROSS,
      'network',
      NETWORK_TAKE_RATE_DEFAULT,
      stripeCrew,
    )
    expect(paid - ifTheGrantLeaked).toBeGreaterThan(duesCents)
    expect(paid).toBe(1000)
  })
})

describe('source shape: the guard is in the code, not just in this file', () => {
  const src = readFileSync(join(__dirname, 'pricing-keys.ts'), 'utf8')

  it('memberNetworkTakeRateBps narrows through billedTier', () => {
    const fn = src.slice(src.indexOf('export function memberNetworkTakeRateBps'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toContain('billedTier(sellerTier)')
    // It must not reach for the resolved tier by any of the obvious names.
    expect(body).not.toMatch(/\.tier\b/)
    expect(body).not.toMatch(/effectiveTier|hasActiveCrewGrant|resolveEffectiveTier/)
  })

  it('billedTier collapses an EffectiveTier to its stripeTier, never its tier', () => {
    const ent = readFileSync(join(__dirname, '..', 'core', 'entitlement.ts'), 'utf8')
    const fn = ent.slice(ent.indexOf('export function billedTier'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toContain('seller.stripeTier')
    expect(body).not.toContain('seller.tier')
  })

  it('the pricing module carries the reason in writing, so the next reader is warned', () => {
    expect(src).toContain('LIVE-224')
    expect(src).toContain('granted-crew-take-rate.test.ts')
  })
})
