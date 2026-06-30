import { describe, it, expect } from 'vitest'
import type Stripe from 'stripe'

// Pricing ladder Phase B (ADR-460), the PURE subscription-item -> plan + entitlement mapping (no IO /
// no Stripe / no Supabase): how a multi-item Stripe subscription's items map to the base plan, the
// active add-on set the resolver set-to-targets, the per-item locked (grandfathered) price id, and the
// interval/quantity. The IO halves (persistSpaceSubscriptionItems / readLockedPriceId) write through
// the admin client and are exercised behind the signed webhook.

import {
  asItemKey,
  itemKeyForCatalogKey,
  planForItemKeys,
  addonsForItemKeys,
  reconciledItemsFromSubscription,
  stripItemPortion,
  type ItemKey,
} from './space-subscription-items'

describe('itemKeyForCatalogKey (catalog -> DB item_key)', () => {
  it('pro_base -> base; addon_* -> their short key; seat/org map 1:1', () => {
    expect(itemKeyForCatalogKey('pro_base')).toBe('base')
    expect(itemKeyForCatalogKey('addon_marketing')).toBe('marketing')
    expect(itemKeyForCatalogKey('addon_ai')).toBe('ai')
    expect(itemKeyForCatalogKey('addon_team')).toBe('team')
    expect(itemKeyForCatalogKey('addon_branding')).toBe('branding')
    expect(itemKeyForCatalogKey('nonprofit_seat')).toBe('nonprofit_seat')
    expect(itemKeyForCatalogKey('organization')).toBe('organization')
  })

  it('an unknown catalog key -> null (default-deny)', () => {
    expect(itemKeyForCatalogKey('nonsense')).toBeNull()
    expect(itemKeyForCatalogKey(null)).toBeNull()
  })
})

describe('stripItemPortion (price key -> catalog item key)', () => {
  it('strips the trailing interval and the optional _list anchor suffix', () => {
    expect(stripItemPortion('pro_base_month')).toBe('pro_base')
    expect(stripItemPortion('pro_base_year')).toBe('pro_base')
    expect(stripItemPortion('addon_marketing_year_list')).toBe('addon_marketing')
    expect(stripItemPortion('nonprofit_seat_month')).toBe('nonprofit_seat')
    expect(stripItemPortion(null)).toBeNull()
  })
})

describe('planForItemKeys', () => {
  it('organization out-ranks all; nonprofit_seat -> nonprofit; base -> pro; empty -> free', () => {
    expect(planForItemKeys(['organization'])).toBe('organization')
    expect(planForItemKeys(['organization', 'base'])).toBe('organization')
    expect(planForItemKeys(['nonprofit_seat'])).toBe('nonprofit')
    expect(planForItemKeys(['base'])).toBe('pro')
    expect(planForItemKeys(['base', 'marketing', 'ai'])).toBe('pro')
    expect(planForItemKeys([])).toBe('free')
  })
})

describe('addonsForItemKeys', () => {
  it('returns only the add-on items as AddonKeys, deduped; base/seat/org contribute none', () => {
    expect(addonsForItemKeys(['base', 'marketing', 'ai']).sort()).toEqual(['ai', 'marketing'])
    expect(addonsForItemKeys(['base'])).toEqual([])
    expect(addonsForItemKeys(['nonprofit_seat', 'organization'])).toEqual([])
    expect(addonsForItemKeys(['base', 'team', 'team' as ItemKey])).toEqual(['team'])
  })
})

describe('asItemKey (default-deny)', () => {
  it('accepts the seven DB item keys, rejects others', () => {
    expect(asItemKey('base')).toBe('base')
    expect(asItemKey('nonprofit_seat')).toBe('nonprofit_seat')
    expect(asItemKey('pro_base')).toBeNull() // that is a CATALOG key, not a DB key
    expect(asItemKey(null)).toBeNull()
  })
})

// A small helper to fake a Stripe subscription item with a price carrying the catalog metadata key.
function fakeItem(opts: {
  id: string
  catalogKey: string
  interval?: 'month' | 'year'
  quantity?: number
  priceId?: string
}): Stripe.SubscriptionItem {
  return {
    id: opts.id,
    quantity: opts.quantity ?? 1,
    price: {
      id: opts.priceId ?? `price_${opts.id}`,
      recurring: { interval: opts.interval ?? 'month' },
      metadata: { frequency_pricing_key: opts.catalogKey },
    },
  } as unknown as Stripe.SubscriptionItem
}

function fakeSub(items: Stripe.SubscriptionItem[]): Stripe.Subscription {
  return { items: { data: items } } as unknown as Stripe.Subscription
}

describe('reconciledItemsFromSubscription (the webhook item read)', () => {
  it('maps a Pro + Marketing loadout to base + marketing items with their locked price ids', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_base', catalogKey: 'pro_base_month', priceId: 'price_pro_founding' }),
      fakeItem({ id: 'si_mkt', catalogKey: 'addon_marketing_month', priceId: 'price_mkt_founding' }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    expect(items).toHaveLength(2)

    const base = items.find((i) => i.itemKey === 'base')!
    expect(base.stripeSubscriptionItemId).toBe('si_base')
    expect(base.lockedPriceId).toBe('price_pro_founding') // the charged price is recorded as the lock
    expect(base.interval).toBe('month')
    expect(base.quantity).toBe(1)

    const mkt = items.find((i) => i.itemKey === 'marketing')!
    expect(mkt.lockedPriceId).toBe('price_mkt_founding')

    // The full mapping the resolver consumes: base -> pro, marketing add-on active.
    const keys = items.map((i) => i.itemKey)
    expect(planForItemKeys(keys)).toBe('pro')
    expect(addonsForItemKeys(keys)).toEqual(['marketing'])
  })

  it('carries the yearly interval and the seat quantity for a Team item', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_base', catalogKey: 'pro_base_year', interval: 'year' }),
      fakeItem({ id: 'si_team', catalogKey: 'addon_team_year', interval: 'year', quantity: 4 }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    const team = items.find((i) => i.itemKey === 'team')!
    expect(team.interval).toBe('year')
    expect(team.quantity).toBe(4)
  })

  it('maps a nonprofit seat subscription to the nonprofit plan with its seat quantity', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_seat', catalogKey: 'nonprofit_seat_month', quantity: 3 }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    expect(planForItemKeys(items.map((i) => i.itemKey))).toBe('nonprofit')
    expect(items[0].quantity).toBe(3)
  })

  it('SKIPS a stray line item whose price carries no recognized catalog key (no entitlement forge)', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_base', catalogKey: 'pro_base_month' }),
      fakeItem({ id: 'si_junk', catalogKey: 'some_other_product_month' }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    expect(items.map((i) => i.itemKey)).toEqual(['base'])
  })
})
