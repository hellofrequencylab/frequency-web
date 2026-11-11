import { describe, expect, it } from 'vitest'
import { planOrderProjection } from './merch'
import { toOrderSource, toStoreOffer } from './order-hooks'

const offer = toStoreOffer({ id: 'o1', hunt_id: 'h1', seller_space_id: 's1', product_id: 'p1', variant_id: 'v1', benefit_code: 'tee', requires_state: 'paid', status: 'approved' })
const order = (status: 'pending' | 'paid' | 'refunded') =>
  toOrderSource({ id: 'ord1', status, owner_space_id: 's1', buyer_profile_id: 'b1' }, [
    { id: 'l1', product_id: 'p1', variant_id: 'v1', qty: 2 },
    { id: 'l2', product_id: 'p9', variant_id: null, qty: 1 },
  ])

describe('order projection through the call-site mapping', () => {
  it('a quantity-two bound line gives two benefits and an ordinary line gives none', () => {
    const plan = planOrderProjection(order('paid'), [offer])
    expect(plan.ok && plan.units.map((u) => u.unitKey)).toEqual(['l1:1', 'l1:2'])
  })
  it('a replay plans the same unit keys and semantic keys', () => {
    const a = planOrderProjection(order('paid'), [offer])
    const b = planOrderProjection(order('paid'), [offer])
    expect(a).toEqual(b)
  })
  it('nothing projects before payment settles or after a refund', () => {
    expect(planOrderProjection(order('pending'), [offer]).ok).toBe(false)
    expect(planOrderProjection(order('refunded'), [offer]).ok).toBe(false)
  })
})
