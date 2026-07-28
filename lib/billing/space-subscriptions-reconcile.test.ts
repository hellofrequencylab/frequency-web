import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// Pricing ladder Phase B (ADR-460), the MULTI-ITEM webhook reconcile: reconcileSpacePlanSubscription
// reads ALL of a subscription's items, maps each item_key -> the base plan + active add-on set, and
// SET-TO-TARGETs the billing namespace via setSpaceAddons. These tests stub setSpaceAddons /
// setSpacePlan / the item persistence + the admin client, and assert the right target is computed for
// a multi-item Pro loadout, a nonprofit seat sub, and a canceled sub (revert to free / empty set).

// Capture the calls into the entitlement writers.
let addonCalls: { spaceId: string; plan: string; addons: string[] }[] = []
let planCalls: { spaceId: string; plan: string }[] = []
let persistCalls: { spaceId: string; itemKeys: string[]; status: string }[] = []

vi.mock('@/lib/pricing/space-plan', () => ({
  setSpaceAddons: (spaceId: string, input: { plan: string; addons: string[] }) => {
    addonCalls.push({ spaceId, plan: input.plan, addons: [...input.addons] })
    return Promise.resolve({ ok: true, plan: input.plan })
  },
  setSpacePlan: (spaceId: string, plan: string) => {
    planCalls.push({ spaceId, plan })
    return Promise.resolve({ ok: true, plan })
  },
}))

vi.mock('./space-subscription-items', async (importOriginal) => {
  // Keep the PURE mapping (reconciledItemsFromSubscription / planForItemKeys / addonsForItemKeys) real;
  // only stub the IO persistence so no admin client is touched.
  const actual = await importOriginal<typeof import('./space-subscription-items')>()
  return {
    ...actual,
    persistSpaceSubscriptionItems: (spaceId: string, items: { itemKey: string }[], status: string) => {
      persistCalls.push({ spaceId, itemKeys: items.map((i) => i.itemKey), status })
      return Promise.resolve()
    },
  }
})

// The admin client. The reconciler READS spaces.stripe_subscription_id (the evidence that decides
// whether a cancel may lapse a founder, ADR-880) and then writes it, so the stub answers both.
let spaceRow: { stripe_subscription_id: string | null } | null = { stripe_subscription_id: null }
let spaceUpdates: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: spaceRow }) }) }),
      update: (patch: Record<string, unknown>) => {
        spaceUpdates.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  }),
}))

// The founding grant + lapse are recorded rather than run: what matters here is WHETHER the reconciler
// reaches them and with what (ADR-880). The pure money/interval test has its own suite
// (founding-payment.test.ts) and the grant its own (beta-founding.test.ts).
let grantCalls: { kind: string; spaceId?: string | null; lockedRateCents?: number | null; atMs: number }[] = []
let lapseCalls: { spaceId?: string | null; profileId?: string | null }[] = []

vi.mock('./beta-founding', () => ({
  grantBetaFounding: (input: { kind: string; spaceId?: string | null; lockedRateCents?: number | null; atMs: number }) => {
    grantCalls.push(input)
    return Promise.resolve({ granted: true, reason: 'granted' })
  },
}))

vi.mock('@/lib/founding/status', () => ({
  lapseFoundingStatus: (subject: { spaceId?: string | null; profileId?: string | null }) => {
    lapseCalls.push(subject)
    return Promise.resolve({ ok: true, data: { lapsed: true } })
  },
}))

import { reconcileSpacePlanSubscription } from './space-subscriptions'

function fakeItem(
  catalogKey: string,
  opts: { interval?: 'month' | 'year'; quantity?: number; priceId?: string; unitAmount?: number } = {},
): Stripe.SubscriptionItem {
  return {
    id: `si_${catalogKey}`,
    quantity: opts.quantity ?? 1,
    price: {
      id: opts.priceId ?? `price_${catalogKey}`,
      unit_amount: opts.unitAmount ?? 1900,
      recurring: { interval: opts.interval ?? 'month' },
      metadata: { frequency_pricing_key: catalogKey },
    },
  } as unknown as Stripe.SubscriptionItem
}

function fakeSub(opts: {
  status: Stripe.Subscription.Status
  items: Stripe.SubscriptionItem[]
  metadata?: Record<string, string>
  id?: string
}): Stripe.Subscription {
  return {
    id: opts.id ?? 'sub_1',
    status: opts.status,
    created: Math.floor(Date.parse('2026-08-01T00:00:00.000Z') / 1000),
    customer: 'cus_1',
    items: { data: opts.items },
    metadata: { kind: 'space_plan', space_id: 'space-1', ...(opts.metadata ?? {}) },
  } as unknown as Stripe.Subscription
}

beforeEach(() => {
  addonCalls = []
  planCalls = []
  persistCalls = []
  grantCalls = []
  lapseCalls = []
  spaceUpdates = []
  spaceRow = { stripe_subscription_id: null }
})

describe('reconcileSpacePlanSubscription, multi-item set-to-target (ADR-460)', () => {
  it('a legacy Pro + AI loadout set-to-targets business with the AI add-on (collapsed ADR-552)', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({
        status: 'active',
        items: [fakeItem('pro_base_month'), fakeItem('addon_ai_month')],
      }),
    )
    expect(addonCalls).toHaveLength(1)
    expect(addonCalls[0].spaceId).toBe('space-1')
    expect(addonCalls[0].plan).toBe('business') // legacy Pro base folds to business
    expect(addonCalls[0].addons.sort()).toEqual(['ai'])
    // The base-plan-only writer is NOT used on the multi-item path.
    expect(planCalls).toHaveLength(0)
    // The item rows are persisted with the active status.
    expect(persistCalls[0].itemKeys.sort()).toEqual(['ai', 'base'])
    expect(persistCalls[0].status).toBe('active')
  })

  it('a Business base + AI sub set-to-targets business (full depth) with the AI add-on', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({
        status: 'active',
        items: [fakeItem('business_base_month'), fakeItem('addon_ai_month')],
      }),
    )
    expect(addonCalls).toHaveLength(1)
    expect(addonCalls[0].plan).toBe('business')
    expect(addonCalls[0].addons.sort()).toEqual(['ai'])
    expect(persistCalls[0].itemKeys.sort()).toEqual(['ai', 'business'])
  })

  it('a trialing loadout persists items as trialing (the trial is granted as active entitlements)', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'trialing', items: [fakeItem('pro_base_month')] }),
    )
    expect(addonCalls[0].plan).toBe('business')
    expect(persistCalls[0].status).toBe('trialing')
  })

  it('a nonprofit seat sub set-to-targets the nonprofit plan (all-inclusive)', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'active', items: [fakeItem('nonprofit_seat_month', { quantity: 3 })] }),
    )
    expect(addonCalls[0].plan).toBe('nonprofit')
    expect(persistCalls[0].itemKeys).toEqual(['nonprofit_seat'])
  })

  it('a canceled sub targets the EMPTY set (revert to free) and cancels the item rows', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'canceled', items: [fakeItem('pro_base_month')], metadata: { plan: 'pro' } }),
    )
    // No items reconciled (canceled -> empty), so the fallback base-plan writer reverts to free.
    expect(addonCalls).toHaveLength(0)
    expect(planCalls).toHaveLength(1)
    expect(planCalls[0].plan).toBe('free')
    expect(persistCalls[0].itemKeys).toEqual([])
    expect(persistCalls[0].status).toBe('canceled')
  })

  it('a LEGACY single-price sub with no recognized catalog items falls back to metadata.plan', async () => {
    // A Phase A subscription: the price carries no frequency_pricing_key, so no items reconcile.
    const legacyItem = { id: 'si_legacy', quantity: 1, price: { id: 'price_legacy', recurring: { interval: 'month' }, metadata: {} } } as unknown as Stripe.SubscriptionItem
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'active', items: [legacyItem], metadata: { plan: 'pro' } }),
    )
    expect(addonCalls).toHaveLength(0)
    expect(planCalls[0].plan).toBe('business') // legacy 'pro' metadata narrows to business
  })

  it('no-ops on a missing space_id', async () => {
    const sub = { id: 'sub_x', status: 'active', items: { data: [] }, metadata: {} } as unknown as Stripe.Subscription
    await reconcileSpacePlanSubscription(sub)
    expect(addonCalls).toHaveLength(0)
    expect(planCalls).toHaveLength(0)
    expect(persistCalls).toHaveLength(0)
  })
})

// ── THE FOUNDING GRANT IS EARNED, NOT ASSUMED (ADR-880) ──────────────────────────────────────────
// The old test was `settledPlan !== 'free'`: a subscription EXISTING. These lock the three conditions
// at the reconcile point — money moved, it was the year, and (in beta-founding) it was before the
// cutoff — plus the lapse that makes "for as long as you keep the plan" true in code.

describe('the Founding Business grant at reconcile (ADR-880)', () => {
  it('an ANNUAL, ACTIVE, paid Business plan grants, at the MONTHLY-normalized base rate', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({
        status: 'active',
        // Deliberately out of order and with the add-on FIRST: the base must be found by its catalog
        // key, never by items.data[0].
        items: [
          fakeItem('addon_ai_year', { interval: 'year', unitAmount: 20000 }),
          fakeItem('business_base_year', { interval: 'year', unitAmount: 19000 }),
        ],
      }),
    )
    expect(grantCalls).toHaveLength(1)
    expect(grantCalls[0].kind).toBe('business')
    expect(grantCalls[0].spaceId).toBe('space-1')
    // $190/yr is the $19/mo plan, not $200 (the add-on) and not $15.83 (a /12 average).
    expect(grantCalls[0].lockedRateCents).toBe(1900)
  })

  it('a TRIALING plan grants NOTHING: a free trial is not a payment', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'trialing', items: [fakeItem('business_base_year', { interval: 'year', unitAmount: 19000 })] }),
    )
    expect(grantCalls).toEqual([])
  })

  it('past_due and incomplete grant NOTHING: a card that never cleared is not a purchase', async () => {
    for (const status of ['past_due', 'incomplete'] as const) {
      grantCalls = []
      await reconcileSpacePlanSubscription(
        fakeSub({ status, items: [fakeItem('collective_base_year', { interval: 'year', unitAmount: 49000 })] }),
      )
      expect(grantCalls).toEqual([])
    }
  })

  it('a MONTHLY paid plan grants nothing: the badge comes with the year', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'active', items: [fakeItem('business_base_month', { unitAmount: 1900 })] }),
    )
    expect(grantCalls).toEqual([])
    // ...and the plan itself is still granted. Only the badge is withheld.
    expect(addonCalls[0].plan).toBe('business')
  })

  it('a $0 subscription grants nothing (a 100%-off promotion code is not money moving)', async () => {
    const sub = fakeSub({
      status: 'active',
      items: [fakeItem('collective_base_year', { interval: 'year', unitAmount: 49000 })],
    })
    ;(sub as unknown as { discounts: unknown[] }).discounts = [{ coupon: { percent_off: 100 } }]
    await reconcileSpacePlanSubscription(sub)
    expect(grantCalls).toEqual([])
  })
})

describe('the founding LAPSE at reconcile (ADR-880)', () => {
  it('a canceled subscription the Space was ON lapses its founding row', async () => {
    spaceRow = { stripe_subscription_id: 'sub_1' }
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'canceled', items: [fakeItem('business_base_year')], metadata: { plan: 'business' } }),
    )
    expect(lapseCalls).toEqual([{ spaceId: 'space-1' }])
    // The subscription id is cleared in the same pass.
    expect(spaceUpdates.some((u) => u.stripe_subscription_id === null)).toBe(true)
  })

  it('`unpaid` (Stripe gave up collecting) also lapses', async () => {
    spaceRow = { stripe_subscription_id: 'sub_1' }
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'unpaid', items: [fakeItem('business_base_year')], metadata: { plan: 'business' } }),
    )
    expect(lapseCalls).toHaveLength(1)
  })

  it('a HAND-RECORDED cash founder is never lapsed: no Stripe subscription, no reconcile may touch it', async () => {
    // The three cash Spaces paid for the year off-Stripe. Their founding rows exist; their Spaces hold
    // NO stripe_subscription_id. A canceled event for some other subscription must not strip them.
    spaceRow = { stripe_subscription_id: null }
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'canceled', items: [], metadata: { plan: 'business' }, id: 'sub_someone_else' }),
    )
    expect(lapseCalls).toEqual([])
  })

  it('a cancel of a DIFFERENT subscription than the one the Space is on does not lapse', async () => {
    spaceRow = { stripe_subscription_id: 'sub_current' }
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'canceled', items: [], metadata: { plan: 'business' }, id: 'sub_old' }),
    )
    expect(lapseCalls).toEqual([])
  })

  it('past_due does NOT lapse: dunning grace keeps a paying founder a founder while Stripe retries', async () => {
    spaceRow = { stripe_subscription_id: 'sub_1' }
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'past_due', items: [fakeItem('business_base_year')] }),
    )
    expect(lapseCalls).toEqual([])
  })
})
