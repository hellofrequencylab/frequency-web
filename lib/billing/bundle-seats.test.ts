import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// HOUSEHOLD / CIRCLE BUNDLE SEATING (ADR-370) — the webhook half. This is money: a bundle purchase
// that seats nobody, or seats somebody twice, or strips a member of a membership they pay for
// themselves, is a real charge with a wrong outcome. So the two things the owner's ruling named are
// pinned here directly:
//
//   (a) the HAPPY PATH seats exactly the right entitlements — the owner plus the stamped seats, capped
//       at the seat count the bundle was bought with, and nobody else;
//   (b) REPLAYING the same webhook event seats nothing extra — proved twice over, once through the
//       ordering guard (the same event is dropped) and once THROUGH it (a later event on an unchanged
//       roster is a no-op), because the second is what really protects the buyer when Stripe
//       redelivers a renewal.
//
// The fake below MODELS the plpgsql in migration 20270225000000 statement for statement, so the
// seating semantics are exercised end to end from a Stripe event. The real SQL is pinned separately by
// supabase/tests/household_bundle_seating.test.sql (pgTAP, run by .github/workflows/db-tests.yml
// against a freshly-migrated database), which is the only thing that can prove the transaction itself.

interface Row {
  id: string
  membership_tier: string | null
  membership_payment_status?: string | null
  household_bundle_id?: string | null
  household_bundle_prior_tier?: string | null
  household_bundle_event_at?: string | null
  stripe_customer_id?: string | null
}

const H = vi.hoisted(() => ({
  rows: [] as Row[],
  calls: [] as Record<string, unknown>[],
  rpcError: null as { message: string } | null,
}))

/** The model of apply_bundle_seating_atomic. Mirrors the migration: ordering guard, unseat-who-left,
 *  seat-who-joined (recording prior_tier ONLY on the way in), re-assert the granted tier, advance the
 *  stamp. Every write is set-to-target keyed by profile id, exactly as the SQL is. */
function applyBundleSeatingAtomic(args: {
  _owner: string
  _event_at: string
  _seat_ids: string[]
  _tier: string
  _seats: number
  _active: boolean
  _customer_id: string | null
}) {
  const owner = H.rows.find((r) => r.id === args._owner)
  if (!owner) return { applied: false, reason: 'no_owner' }
  if (args._tier !== 'crew' && args._tier !== 'supporter') return { applied: false, reason: 'invalid_tier' }
  const last = owner.household_bundle_event_at
  if (last && new Date(args._event_at) <= new Date(last)) return { applied: false, reason: 'stale', last }

  const restore = (r: Row) => {
    if ((r.membership_payment_status ?? '') !== 'active') r.membership_tier = r.household_bundle_prior_tier ?? 'free'
    r.household_bundle_prior_tier = null
    r.household_bundle_id = null
  }

  let seated = 0
  let unseated = 0
  if (args._active) {
    const roster = [args._owner, ...args._seat_ids]
      .filter((id, i, a) => a.indexOf(id) === i)
      .filter((id) => H.rows.some((r) => r.id === id))
      .slice(0, Math.max(1, args._seats))
    for (const r of H.rows) {
      if (r.household_bundle_id === args._owner && !roster.includes(r.id)) {
        restore(r)
        unseated++
      }
    }
    for (const id of roster) {
      const r = H.rows.find((x) => x.id === id)!
      if (r.household_bundle_id !== args._owner) {
        r.household_bundle_prior_tier = r.membership_tier ?? 'free'
        r.household_bundle_id = args._owner
        if ((r.membership_tier ?? 'free') === 'free') r.membership_tier = args._tier
        seated++
      }
    }
    for (const r of H.rows) {
      if (r.household_bundle_id === args._owner && (r.membership_tier ?? 'free') === 'free') r.membership_tier = args._tier
    }
  } else {
    for (const r of H.rows) {
      if (r.household_bundle_id === args._owner) {
        restore(r)
        unseated++
      }
    }
  }

  owner.household_bundle_event_at = args._event_at
  owner.stripe_customer_id = args._customer_id ?? owner.stripe_customer_id ?? null
  return { applied: true, seated, unseated }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      H.calls.push({ name, ...args })
      if (H.rpcError) return { data: null, error: H.rpcError }
      return { data: applyBundleSeatingAtomic(args as Parameters<typeof applyBundleSeatingAtomic>[0]), error: null }
    },
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  getHouseholdBundle: async () => ({ seats: 4, monthly_cents: 2400, annual_cents: 24000, tier: 'crew' }),
}))

import {
  reconcileBundleSubscription,
  bundleRoster,
  bundleSeatingAction,
  bundleSeatIdsFromMetadata,
  bundleTermsFromMetadata,
  isBundleMetadata,
} from './bundle-seats'

const OWNER = '11111111-1111-4111-8111-111111111111'
const SEAT_A = '22222222-2222-4222-8222-222222222222'
const SEAT_B = '33333333-3333-4333-8333-333333333333'
const SEAT_C = '44444444-4444-4444-8444-444444444444'
const SEAT_D = '55555555-5555-4555-8555-555555555555'
const STRANGER = '66666666-6666-4666-8666-666666666666'

function sub(opts: {
  status?: string
  metadata?: Record<string, string> | null
  customer?: string | null
}): Stripe.Subscription {
  return {
    id: 'sub_bundle',
    status: opts.status ?? 'active',
    customer: opts.customer === undefined ? 'cus_1' : opts.customer,
    metadata:
      opts.metadata === null
        ? {}
        : {
            kind: 'household_bundle',
            owner_id: OWNER,
            billing_period: 'monthly',
            bundle_seats: '4',
            bundle_tier: 'crew',
            seat_ids: `${SEAT_A},${SEAT_B}`,
            ...(opts.metadata ?? {}),
          },
  } as unknown as Stripe.Subscription
}

const snapshot = () => JSON.stringify(H.rows)
const row = (id: string) => H.rows.find((r) => r.id === id)!

beforeEach(() => {
  H.calls.length = 0
  H.rpcError = null
  H.rows = [
    { id: OWNER, membership_tier: 'free' },
    { id: SEAT_A, membership_tier: 'free' },
    { id: SEAT_B, membership_tier: 'free' },
    { id: SEAT_C, membership_tier: 'free' },
    { id: SEAT_D, membership_tier: 'free' },
    { id: STRANGER, membership_tier: 'free' },
  ]
})

describe('bundle seating — the pure decisions', () => {
  it('routes only its own metadata kind', () => {
    expect(isBundleMetadata({ kind: 'household_bundle' } as Stripe.Metadata)).toBe(true)
    expect(isBundleMetadata({ kind: 'space_plan' } as Stripe.Metadata)).toBe(false)
    expect(isBundleMetadata(null)).toBe(false)
  })

  it('keeps the seats through a failed renewal (dunning grace) and empties only on a terminal status', () => {
    expect(bundleSeatingAction('active')).toBe('seat')
    expect(bundleSeatingAction('trialing')).toBe('seat')
    expect(bundleSeatingAction('past_due')).toBe('seat')
    expect(bundleSeatingAction('canceled')).toBe('unseat')
    expect(bundleSeatingAction('unpaid')).toBe('unseat')
    expect(bundleSeatingAction('incomplete_expired')).toBe('unseat')
    expect(bundleSeatingAction('incomplete')).toBe('skip')
    expect(bundleSeatingAction(undefined)).toBe('skip')
  })

  it('drops anything that is not a uuid out of the stamped seat list', () => {
    expect(bundleSeatIdsFromMetadata({ seat_ids: `${SEAT_A}, ${SEAT_B}` } as Stripe.Metadata)).toEqual([SEAT_A, SEAT_B])
    expect(bundleSeatIdsFromMetadata({ seat_ids: `${SEAT_A},not-an-id,` } as Stripe.Metadata)).toEqual([SEAT_A])
    expect(bundleSeatIdsFromMetadata({} as Stripe.Metadata)).toEqual([])
  })

  it('prefers the terms stamped at purchase over the live config', () => {
    expect(bundleTermsFromMetadata({ bundle_seats: '6', bundle_tier: 'crew' } as Stripe.Metadata)).toEqual({
      seats: 6,
      tier: 'crew',
    })
    expect(bundleTermsFromMetadata({ bundle_seats: 'lots', bundle_tier: 'free' } as Stripe.Metadata)).toEqual({
      seats: null,
      tier: null,
    })
  })

  it('a stamp carrying the RETIRED Supporter rung reads as no tier, not as a grantable one', () => {
    // Crew is the only grantable member rung (retired 2026-08-24), and profiles.membership_tier
    // CHECKs to exactly ('free','crew') — a 'supporter' stamp would have made the seating RPC reject
    // the bundle outright. Reading it as null hands the decision back to the live config.
    expect(bundleTermsFromMetadata({ bundle_seats: '6', bundle_tier: 'supporter' } as Stripe.Metadata)).toEqual({
      seats: 6,
      tier: null,
    })
  })

  it('builds a deterministic roster: owner first, de-duplicated, capped at the seats bought', () => {
    expect(bundleRoster(OWNER, [SEAT_A, SEAT_B], 4)).toEqual([OWNER, SEAT_A, SEAT_B])
    expect(bundleRoster(OWNER, [SEAT_A, SEAT_A, OWNER], 4)).toEqual([OWNER, SEAT_A])
    expect(bundleRoster(OWNER, [SEAT_A, SEAT_B, SEAT_C, SEAT_D], 4)).toEqual([OWNER, SEAT_A, SEAT_B, SEAT_C])
    // Same inputs, same roster, every time. This is what makes a replay a no-op.
    expect(bundleRoster(OWNER, [SEAT_A, SEAT_B], 4)).toEqual(bundleRoster(OWNER, [SEAT_A, SEAT_B], 4))
  })
})

describe('bundle seating — (a) the happy path seats exactly the right entitlements', () => {
  it('seats the owner and the stamped members, and nobody else', async () => {
    const res = await reconcileBundleSubscription(sub({}), 1000)
    expect(res).toMatchObject({ handled: true, applied: true, seated: 3, unseated: 0 })

    for (const id of [OWNER, SEAT_A, SEAT_B]) {
      expect(row(id).household_bundle_id).toBe(OWNER)
      expect(row(id).membership_tier).toBe('crew')
      expect(row(id).household_bundle_prior_tier).toBe('free')
    }
    // Not on the roster: untouched, still free, still unseated.
    for (const id of [SEAT_C, SEAT_D, STRANGER]) {
      expect(row(id).household_bundle_id ?? null).toBe(null)
      expect(row(id).membership_tier).toBe('free')
    }
    // The owner's Stripe customer is adopted in the same call.
    expect(row(OWNER).stripe_customer_id).toBe('cus_1')
  })

  it('never seats more people than the bundle was bought for', async () => {
    await reconcileBundleSubscription(
      sub({ metadata: { seat_ids: [SEAT_A, SEAT_B, SEAT_C, SEAT_D].join(',') } }),
      1000,
    )
    expect(H.rows.filter((r) => r.household_bundle_id === OWNER).map((r) => r.id)).toEqual([
      OWNER,
      SEAT_A,
      SEAT_B,
      SEAT_C,
    ])
    expect(row(SEAT_D).membership_tier).toBe('free')
  })

  it('is upgrade-only: a member who already pays for Crew keeps it, and gets it back on unseat', async () => {
    row(SEAT_A).membership_tier = 'crew'
    row(SEAT_A).membership_payment_status = 'active'

    await reconcileBundleSubscription(sub({}), 1000)
    expect(row(SEAT_A).membership_tier).toBe('crew')
    expect(row(SEAT_A).household_bundle_prior_tier).toBe('crew')

    await reconcileBundleSubscription(sub({ status: 'canceled' }), 2000)
    expect(row(SEAT_A).membership_tier).toBe('crew') // their own subscription is untouched
    expect(row(SEAT_A).household_bundle_id ?? null).toBe(null)
  })

  it('a failed renewal keeps the household seated; a cancel empties it and restores every seat', async () => {
    await reconcileBundleSubscription(sub({}), 1000)

    await reconcileBundleSubscription(sub({ status: 'past_due' }), 2000)
    expect(H.rows.filter((r) => r.household_bundle_id === OWNER)).toHaveLength(3)
    expect(row(SEAT_B).membership_tier).toBe('crew')

    const res = await reconcileBundleSubscription(sub({ status: 'canceled' }), 3000)
    expect(res).toMatchObject({ applied: true, unseated: 3 })
    for (const id of [OWNER, SEAT_A, SEAT_B]) {
      expect(row(id).household_bundle_id ?? null).toBe(null)
      expect(row(id).membership_tier).toBe('free')
      expect(row(id).household_bundle_prior_tier ?? null).toBe(null)
    }
  })

  it('drops a member the owner removed from the roster, without touching the rest', async () => {
    await reconcileBundleSubscription(sub({}), 1000)
    await reconcileBundleSubscription(sub({ metadata: { seat_ids: SEAT_A } }), 2000)
    expect(row(SEAT_B).household_bundle_id ?? null).toBe(null)
    expect(row(SEAT_B).membership_tier).toBe('free')
    expect(row(SEAT_A).household_bundle_id).toBe(OWNER)
    expect(row(SEAT_A).membership_tier).toBe('crew')
  })
})

describe('bundle seating — (b) a replay seats nothing extra', () => {
  it('drops a redelivery of the SAME event and changes not one row', async () => {
    await reconcileBundleSubscription(sub({}), 1000)
    const after = snapshot()

    const replay = await reconcileBundleSubscription(sub({}), 1000)
    expect(replay).toMatchObject({ handled: true, applied: false, reason: 'stale' })
    expect(snapshot()).toBe(after)
  })

  it('drops an out-of-order straggler that would otherwise re-seat a canceled bundle', async () => {
    await reconcileBundleSubscription(sub({}), 1000)
    await reconcileBundleSubscription(sub({ status: 'canceled' }), 3000)
    const emptied = snapshot()

    // A delayed `active` Stripe CREATED before the cancel, DELIVERED after it.
    const straggler = await reconcileBundleSubscription(sub({}), 2000)
    expect(straggler).toMatchObject({ applied: false, reason: 'stale' })
    expect(snapshot()).toBe(emptied)
  })

  it('a LATER event on the same roster (a renewal) re-seats nobody and never re-stamps prior tiers', async () => {
    row(SEAT_A).membership_tier = 'crew' // they were already paid-up when the bundle seated them
    await reconcileBundleSubscription(sub({}), 1000)
    expect(row(SEAT_A).household_bundle_prior_tier).toBe('crew')

    // This one passes the ordering guard, so it is the real test of set-to-target seating.
    const renewal = await reconcileBundleSubscription(sub({}), 2000)
    expect(renewal).toMatchObject({ applied: true, seated: 0, unseated: 0 })
    expect(H.rows.filter((r) => r.household_bundle_id === OWNER)).toHaveLength(3)
    // prior_tier is recorded ONLY on the way in. If a replay overwrote it with the granted tier, the
    // eventual cancel would leave everyone on Crew for free. It does not.
    expect(row(SEAT_A).household_bundle_prior_tier).toBe('crew')
    expect(row(OWNER).household_bundle_prior_tier).toBe('free')

    await reconcileBundleSubscription(sub({ status: 'canceled' }), 3000)
    expect(row(SEAT_A).membership_tier).toBe('crew')
    expect(row(OWNER).membership_tier).toBe('free')
  })

  it('replaying a cancel unseats nobody a second time', async () => {
    await reconcileBundleSubscription(sub({}), 1000)
    await reconcileBundleSubscription(sub({ status: 'canceled' }), 2000)
    const emptied = snapshot()
    const again = await reconcileBundleSubscription(sub({ status: 'canceled' }), 3000)
    expect(again).toMatchObject({ applied: true, unseated: 0 })
    expect(H.rows.map((r) => ({ ...r, household_bundle_event_at: null }))).toEqual(
      JSON.parse(emptied).map((r: Row) => ({ ...r, household_bundle_event_at: null })),
    )
  })
})

describe('bundle seating — routing and failure', () => {
  it('leaves a non-bundle subscription to the other handlers', async () => {
    const res = await reconcileBundleSubscription(sub({ metadata: null }), 1000)
    expect(res).toEqual({ handled: false })
    expect(H.calls).toHaveLength(0)
  })

  it('claims the event but writes nothing when a bundle subscription carries no usable owner', async () => {
    const res = await reconcileBundleSubscription(sub({ metadata: { owner_id: 'nope' } }), 1000)
    expect(res).toMatchObject({ handled: true, applied: false, reason: 'no_owner_id' })
    expect(H.calls).toHaveLength(0)
  })

  it('empties the bundle on an explicitly terminal event, whatever status the payload carries', async () => {
    await reconcileBundleSubscription(sub({}), 1000)
    // customer.subscription.deleted IS the cancellation; the branch must not depend on `status`.
    const res = await reconcileBundleSubscription(sub({ status: undefined }), 2000, { terminal: true })
    expect(res).toMatchObject({ applied: true, unseated: 3 })
    expect(H.rows.filter((r) => r.household_bundle_id === OWNER)).toHaveLength(0)
  })

  it('does not advance the ordering stamp for an unconfirmed (incomplete) subscription', async () => {
    const res = await reconcileBundleSubscription(sub({ status: 'incomplete' }), 1000)
    expect(res).toMatchObject({ handled: true, applied: false, reason: 'skipped' })
    expect(H.calls).toHaveLength(0)
    expect(row(OWNER).household_bundle_event_at ?? null).toBe(null)
  })

  it('falls back to the operator config when a subscription predates the stamped terms', async () => {
    await reconcileBundleSubscription(sub({ metadata: { bundle_seats: '', bundle_tier: '' } }), 1000)
    expect(H.calls[0]).toMatchObject({ _seats: 4, _tier: 'crew' })
    expect(row(SEAT_A).membership_tier).toBe('crew')
  })

  it('THROWS on a database error, so the webhook releases its claim and Stripe redelivers', async () => {
    H.rpcError = { message: 'connection reset' }
    await expect(reconcileBundleSubscription(sub({}), 1000)).rejects.toThrow(/bundle seating/)
  })
})
