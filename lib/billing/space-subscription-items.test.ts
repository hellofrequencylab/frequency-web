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

describe('itemKeyForCatalogKey (catalog -> DB item_key · collapsed ADR-552)', () => {
  it('business_base -> business; addon_ai -> ai; nonprofit_seat 1:1; legacy pro_base/organization resolve', () => {
    expect(itemKeyForCatalogKey('business_base')).toBe('business')
    expect(itemKeyForCatalogKey('addon_ai')).toBe('ai')
    expect(itemKeyForCatalogKey('nonprofit_seat')).toBe('nonprofit_seat')
    // Retired catalog keys stay resolvable for a grandfathered legacy subscription row (ADR-552).
    expect(itemKeyForCatalogKey('pro_base')).toBe('base')
    expect(itemKeyForCatalogKey('organization')).toBe('organization')
  })

  it('the retired add-on catalog keys + unknowns -> null (default-deny)', () => {
    // addon_marketing/team/branding are no longer catalog items (folded into Business depth, ADR-472).
    expect(itemKeyForCatalogKey('addon_marketing')).toBeNull()
    expect(itemKeyForCatalogKey('addon_team')).toBeNull()
    expect(itemKeyForCatalogKey('addon_branding')).toBeNull()
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

describe('planForItemKeys (collapsed · ADR-552)', () => {
  it('nonprofit > business > free; legacy org -> nonprofit, legacy base(pro) -> business', () => {
    expect(planForItemKeys(['organization'])).toBe('nonprofit') // legacy org folds to nonprofit
    expect(planForItemKeys(['organization', 'base'])).toBe('nonprofit')
    expect(planForItemKeys(['nonprofit_seat'])).toBe('nonprofit')
    expect(planForItemKeys(['business'])).toBe('business')
    expect(planForItemKeys(['business', 'base'])).toBe('business')
    expect(planForItemKeys(['base'])).toBe('business') // legacy Pro base folds to business
    expect(planForItemKeys(['base', 'ai'])).toBe('business')
    expect(planForItemKeys([])).toBe('free')
  })
})

describe('addonsForItemKeys (re-tiered · ADR-472)', () => {
  it('returns only the AI add-on item; tier/seat/org + retired item keys contribute none', () => {
    expect(addonsForItemKeys(['base', 'ai'])).toEqual(['ai'])
    expect(addonsForItemKeys(['base', 'ai', 'ai' as ItemKey])).toEqual(['ai']) // deduped
    expect(addonsForItemKeys(['business', 'ai'])).toEqual(['ai'])
    expect(addonsForItemKeys(['base'])).toEqual([])
    expect(addonsForItemKeys(['nonprofit_seat', 'organization'])).toEqual([])
    // The retired marketing/team/branding item keys no longer narrow to an AddonKey.
    expect(addonsForItemKeys(['base', 'marketing', 'team', 'branding'])).toEqual([])
  })
})

describe('asItemKey (default-deny)', () => {
  it('accepts the DB item keys (incl. business + the legacy-resolvable ones), rejects others', () => {
    expect(asItemKey('base')).toBe('base')
    expect(asItemKey('business')).toBe('business')
    expect(asItemKey('ai')).toBe('ai')
    expect(asItemKey('nonprofit_seat')).toBe('nonprofit_seat')
    expect(asItemKey('marketing')).toBe('marketing') // kept resolvable for legacy rows
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

describe('reconciledItemsFromSubscription (the webhook item read · collapsed ADR-552)', () => {
  it('maps a legacy Pro + AI loadout to base + ai items with their locked price ids', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_base', catalogKey: 'pro_base_month', priceId: 'price_pro_founding' }),
      fakeItem({ id: 'si_ai', catalogKey: 'addon_ai_month', priceId: 'price_ai_founding' }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    expect(items).toHaveLength(2)

    const base = items.find((i) => i.itemKey === 'base')!
    expect(base.stripeSubscriptionItemId).toBe('si_base')
    expect(base.lockedPriceId).toBe('price_pro_founding') // the charged price is recorded as the lock
    expect(base.interval).toBe('month')
    expect(base.quantity).toBe(1)

    const ai = items.find((i) => i.itemKey === 'ai')!
    expect(ai.lockedPriceId).toBe('price_ai_founding')

    // The full mapping the resolver consumes: the legacy base folds to business, AI add-on active.
    const keys = items.map((i) => i.itemKey)
    expect(planForItemKeys(keys)).toBe('business')
    expect(addonsForItemKeys(keys)).toEqual(['ai'])
  })

  it('maps a Business base + AI subscription to business + ai (full depth + the metered add-on)', () => {
    const sub = fakeSub([
      fakeItem({ id: 'si_biz', catalogKey: 'business_base_year', interval: 'year' }),
      fakeItem({ id: 'si_ai', catalogKey: 'addon_ai_year', interval: 'year' }),
    ])
    const items = reconciledItemsFromSubscription(sub)
    const keys = items.map((i) => i.itemKey)
    expect(planForItemKeys(keys)).toBe('business')
    expect(addonsForItemKeys(keys)).toEqual(['ai'])
    expect(items.find((i) => i.itemKey === 'business')!.interval).toBe('year')
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
