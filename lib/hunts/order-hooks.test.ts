import { describe, expect, it } from 'vitest'
import { planOrderProjection, type OrderSource, type StoreOffer } from './merch'

const offer: StoreOffer = { id: 'o1', huntId: 'h1', sellerSpaceId: 's1', productId: 'p1', variantId: 'v1', benefitCode: 'tee', requiresState: 'paid', status: 'approved' }
const order = (status: OrderSource['status']): OrderSource => ({
  kind: 'store-order',
  id: 'ord1',
  status,
  ownerSpaceId: 's1',
  buyerProfileId: 'b1',
  lines: [
    { id: 'l1', productId: 'p1', variantId: 'v1', qty: 2 },
    { id: 'l2', productId: 'p9', variantId: null, qty: 1 },
  ],
})

describe('order projection as the call site feeds it', () => {
  it('a quantity-two bound line gives two benefits and an ordinary line gives none', () => {
    const plan = planOrderProjection(order('paid'), [offer])
    expect(plan.ok && plan.units.map((u) => u.unitKey)).toEqual(['l1:1', 'l1:2'])
  })
  it('a replay plans the same unit keys and semantic keys', () => {
    expect(planOrderProjection(order('paid'), [offer])).toEqual(planOrderProjection(order('paid'), [offer]))
  })
  it('nothing projects before payment settles or after a refund', () => {
    expect(planOrderProjection(order('pending'), [offer]).ok).toBe(false)
    expect(planOrderProjection(order('refunded'), [offer]).ok).toBe(false)
  })
})
