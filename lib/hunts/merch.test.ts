// FH-038: approved store items. A link creates no benefit; a bound line projects one per unit.
import { describe, expect, it } from 'vitest'
import { planOrderProjection, resolveStoreLink, type OrderSource, type StoreOffer } from './merch'

const offer: StoreOffer = { id: 'o1', huntId: 'h1', sellerSpaceId: 's1', productId: 'p1', variantId: 'v1', benefitCode: 'free-pour', requiresState: 'paid', status: 'approved' }
const order: OrderSource = { kind: 'store-order', id: 'ord1', status: 'paid', ownerSpaceId: 's1', buyerProfileId: 'b1', lines: [{ id: 'l1', productId: 'p1', variantId: 'v1', qty: 2 }, { id: 'l2', productId: 'other', variantId: null, qty: 1 }] }

describe('resolveStoreLink', () => {
  const item = { productId: 'p1', variantId: 'v1', ownerSpaceId: 's1', active: true, inStock: true }
  it('links an approved, active, in-stock item of the right seller and SKU', () => {
    expect(resolveStoreLink(offer, item)).toEqual({ action: 'link', productId: 'p1', variantId: 'v1' })
  })
  it.each([
    ['withdrawn', { ...offer, status: 'withdrawn' as const }, item],
    ['not_found', offer, null],
    ['seller_mismatch', offer, { ...item, ownerSpaceId: 's9' }],
    ['sku_mismatch', offer, { ...item, variantId: 'v9' }],
    ['inactive', offer, { ...item, active: false }],
    ['sold_out', offer, { ...item, inStock: false }],
  ])('removes the purchase action when %s', (reason, o, i) => {
    expect(resolveStoreLink(o, i)).toEqual({ action: 'unavailable', reason })
  })
})

describe('planOrderProjection', () => {
  it('projects one benefit per unit of the bound line and nothing for the ordinary line', () => {
    const plan = planOrderProjection(order, [offer])
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.units.map((u) => u.unitKey)).toEqual(['l1:1', 'l1:2'])
    expect(plan.units[0]).toMatchObject({ offerId: 'o1', bindingId: null, sourceType: 'store-order', profileId: 'b1' })
    expect(plan.skipped).toEqual([{ lineId: 'l2', reason: 'no_bound_offer' }])
    expect(new Set(plan.units.map((u) => u.semanticKey)).size).toBe(2)
  })
  it('replays to the same keys, so a retry cannot duplicate a benefit', () => {
    const a = planOrderProjection(order, [offer])
    const b = planOrderProjection(order, [offer])
    expect(a).toEqual(b)
  })
  it('refuses a substituted SKU or seller', () => {
    const swapped = planOrderProjection({ ...order, lines: [{ id: 'l1', productId: 'p1', variantId: 'v9', qty: 1 }] }, [offer])
    expect(swapped).toMatchObject({ ok: true, units: [], skipped: [{ reason: 'sku_mismatch' }] })
    const other = planOrderProjection({ ...order, ownerSpaceId: 's9' }, [offer])
    expect(other).toMatchObject({ ok: true, units: [], skipped: [{ lineId: 'l1', reason: 'seller_mismatch' }, { lineId: 'l2', reason: 'no_bound_offer' }] })
  })
  it('waits for fulfillment when the offer needs it, and for payment always', () => {
    const needsFulfilled = { ...offer, requiresState: 'fulfilled' as const }
    expect(planOrderProjection(order, [needsFulfilled])).toMatchObject({ ok: true, units: [] })
    expect(planOrderProjection({ ...order, status: 'fulfilled' }, [needsFulfilled])).toMatchObject({ ok: true })
    expect(planOrderProjection({ ...order, status: 'pending' }, [offer])).toMatchObject({ ok: false, disposition: 'pending' })
    expect(planOrderProjection({ ...order, status: 'refunded' }, [offer])).toMatchObject({ ok: false, disposition: 'refused' })
  })
  it('gives a plain link no entitlement', () => {
    expect(planOrderProjection(order, [{ ...offer, benefitCode: null }])).toMatchObject({ ok: true, units: [] })
  })
})
