import { describe, expect, it } from 'vitest'
import { planCartCheckout, type CartPlanLine } from './cart-plan'
import { planFundsFlow } from './funds-flow'

type P = CartPlanLine['product']
const space = (id: string, o: Partial<P> = {}): P => ({ ownerKind: 'space', ownerProfileId: null, ownerSpaceId: id, productKind: 'physical', currency: 'usd', ...o })
const store = (o: Partial<P> = {}): P => ({ ownerKind: 'platform', ownerProfileId: null, ownerSpaceId: null, productKind: 'physical', currency: 'usd', ...o })
const member = (id: string, o: Partial<P> = {}): P => ({ ownerKind: 'profile', ownerProfileId: id, ownerSpaceId: null, productKind: 'physical', currency: 'usd', ...o })
const L = (key: string, product: P, qty = 1, unitCents = 1000): CartPlanLine => ({ key, product, qty, unitCents })

describe('planCartCheckout', () => {
  it('answers an empty plan for an empty cart, never a refusal', () => {
    expect(planCartCheckout([])).toEqual({ sellers: [], needsShipping: false, blocked: null })
  })

  it('groups lines by seller in first-appearance order and sums each seller', () => {
    const plan = planCartCheckout([L('a:', space('s1'), 2, 500), L('b:', space('s2'), 1, 700), L('c:v1', space('s1'), 1, 250)])
    expect(plan.blocked).toBeNull()
    expect(plan.sellers.map((s) => [s.spaceId, s.lineKeys, s.totals])).toEqual([
      ['s1', ['a:', 'c:v1'], [{ currency: 'usd', cents: 1250 }]],
      ['s2', ['b:'], [{ currency: 'usd', cents: 700 }]],
    ])
  })

  it('files a seller under the same key the checkout door groups by', () => {
    const lines = [L('a:', space('s1')), L('b:', space('s2'))]
    const door = planFundsFlow(
      lines.map((l) => ({
        seller: { owner_kind: l.product.ownerKind, owner_profile_id: l.product.ownerProfileId, owner_space_id: l.product.ownerSpaceId },
        currency: l.product.currency,
        qty: l.qty,
        unitCents: l.unitCents,
      })),
    )
    expect('refused' in door).toBe(false)
    if ('refused' in door) return
    expect(planCartCheckout(lines).sellers.map((s) => s.key)).toEqual(door.groups.map((g) => g.key))
  })

  it('says a cart in two currencies cannot be paid, and keeps the currencies apart per seller', () => {
    const plan = planCartCheckout([L('a:', space('s1'), 1, 500), L('b:', space('s1', { currency: 'EUR' }), 2, 300)])
    expect(plan.blocked).toBe('mixed_currency')
    expect(plan.sellers[0].totals).toEqual([
      { currency: 'usd', cents: 500 },
      { currency: 'eur', cents: 600 },
    ])
  })

  it('says the Frequency Store checks out on its own, and lets a Store-only cart through', () => {
    expect(planCartCheckout([L('a:', store()), L('b:', space('s1'))]).blocked).toBe('store_with_others')
    expect(planCartCheckout([L('a:', store()), L('b:', store())]).blocked).toBeNull()
  })

  it('marks a seller who takes contact only and blocks the cart that holds one', () => {
    const plan = planCartCheckout([L('a:', space('s1')), L('b:', member('p1'))])
    expect(plan.blocked).toBe('contact_only')
    expect(plan.sellers.map((s) => s.contactOnly)).toEqual([false, true])
  })

  it('names the currency refusal first, as the door does', () => {
    expect(planCartCheckout([L('a:', member('p1')), L('b:', space('s1', { currency: 'eur' }))]).blocked).toBe('mixed_currency')
  })

  it('asks for an address only when something ships', () => {
    expect(planCartCheckout([L('a:', space('s1', { productKind: 'digital' })), L('b:', space('s1', { productKind: 'journey' }))]).needsShipping).toBe(false)
    expect(planCartCheckout([L('a:', space('s1', { productKind: 'digital' })), L('b:', space('s2'))]).needsShipping).toBe(true)
  })
})
