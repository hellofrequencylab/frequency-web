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

// The admin client (the spaces id persistence at the end of the reconciler). A chainable no-op.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  }),
}))

import { reconcileSpacePlanSubscription } from './space-subscriptions'

function fakeItem(catalogKey: string, opts: { interval?: 'month' | 'year'; quantity?: number; priceId?: string } = {}): Stripe.SubscriptionItem {
  return {
    id: `si_${catalogKey}`,
    quantity: opts.quantity ?? 1,
    price: {
      id: opts.priceId ?? `price_${catalogKey}`,
      recurring: { interval: opts.interval ?? 'month' },
      metadata: { frequency_pricing_key: catalogKey },
    },
  } as unknown as Stripe.SubscriptionItem
}

function fakeSub(opts: {
  status: Stripe.Subscription.Status
  items: Stripe.SubscriptionItem[]
  metadata?: Record<string, string>
}): Stripe.Subscription {
  return {
    id: 'sub_1',
    status: opts.status,
    customer: 'cus_1',
    items: { data: opts.items },
    metadata: { kind: 'space_plan', space_id: 'space-1', ...(opts.metadata ?? {}) },
  } as unknown as Stripe.Subscription
}

beforeEach(() => {
  addonCalls = []
  planCalls = []
  persistCalls = []
})

describe('reconcileSpacePlanSubscription, multi-item set-to-target (ADR-460)', () => {
  it('a Pro + Marketing + AI loadout set-to-targets pro with the two add-ons', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({
        status: 'active',
        items: [fakeItem('pro_base_month'), fakeItem('addon_marketing_month'), fakeItem('addon_ai_month')],
      }),
    )
    expect(addonCalls).toHaveLength(1)
    expect(addonCalls[0].spaceId).toBe('space-1')
    expect(addonCalls[0].plan).toBe('pro')
    expect(addonCalls[0].addons.sort()).toEqual(['ai', 'marketing'])
    // The base-plan-only writer is NOT used on the multi-item path.
    expect(planCalls).toHaveLength(0)
    // The item rows are persisted with the active status.
    expect(persistCalls[0].itemKeys.sort()).toEqual(['ai', 'base', 'marketing'])
    expect(persistCalls[0].status).toBe('active')
  })

  it('a trialing loadout persists items as trialing (the trial is granted as active entitlements)', async () => {
    await reconcileSpacePlanSubscription(
      fakeSub({ status: 'trialing', items: [fakeItem('pro_base_month')] }),
    )
    expect(addonCalls[0].plan).toBe('pro')
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
    expect(planCalls[0].plan).toBe('pro')
  })

  it('no-ops on a missing space_id', async () => {
    const sub = { id: 'sub_x', status: 'active', items: { data: [] }, metadata: {} } as unknown as Stripe.Subscription
    await reconcileSpacePlanSubscription(sub)
    expect(addonCalls).toHaveLength(0)
    expect(planCalls).toHaveLength(0)
    expect(persistCalls).toHaveLength(0)
  })
})
