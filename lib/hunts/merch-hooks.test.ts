import { beforeEach, describe, expect, it, vi } from 'vitest'

// STORE ITEMS ON A HUNT, THROUGH THE HOOKS (FH-038S).
//
// lib/hunts/merch.test.ts proves the plan. This file proves the call sites: the order checkout return
// (`recordCommerceOrderFromSessionId` calls `huntsAfterOrderReturn`), the player's store link, and the
// unit refund finance records. The row's own done-when is tested exactly: a quantity-two bound line
// replayed gives two benefits, and a refunded unit revokes only its own.

const H = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => H.client }))

import { createFakeHuntDb } from './fake-hunt-db'
import { huntsAfterOrderReturn, revokeOrderLineUnits, storeLinksForHunt } from './merch-hooks'
import { huntsAfterOrderSession } from './order-hooks'

const fake = createFakeHuntDb()
H.client = fake.client

const ORDER = '11111111-1111-4111-8111-111111111111'
const LINE = '22222222-2222-4222-8222-222222222222'
const PLAIN = '33333333-3333-4333-8333-333333333333'

const offer = (over: Record<string, unknown> = {}) => ({
  id: 'offer-1', hunt_id: 'hunt-1', seller_space_id: 'space-1', product_id: 'prod-tee', variant_id: null,
  benefit_code: 'tee-pickup', requires_state: 'paid', status: 'approved', ...over,
})

const states = () => Object.fromEntries(fake.tables.hunt_entitlements.map((e) => [e.unit_key, e.state]))

beforeEach(() => {
  fake.reset({
    commerce_orders: [{ id: ORDER, status: 'paid', owner_space_id: 'space-1', buyer_profile_id: 'buyer-1', stripe_checkout_session_id: 'cs_order', stripe_payment_intent_id: 'pi_order' }],
    commerce_order_items: [
      { id: LINE, order_id: ORDER, product_id: 'prod-tee', variant_id: null, qty: 2 },
      { id: PLAIN, order_id: ORDER, product_id: 'prod-mug', variant_id: null, qty: 3 },
    ],
    hunt_store_offers: [offer()],
    commerce_products: [
      { id: 'prod-tee', title: 'Trail tee', owner_space_id: 'space-1', status: 'active', stock: 4 },
      { id: 'prod-mug', title: 'Mug', owner_space_id: 'space-1', status: 'active', stock: null },
    ],
    commerce_variants: [],
    hunt_entitlements: [],
    hunt_entitlement_events: [],
    hunt_refund_cases: [],
  })
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', '1')
})

describe('the order checkout return', () => {
  it('a quantity-two bound line gives two benefits, a replay gives no more, and the plain line gives none', async () => {
    await huntsAfterOrderReturn('cs_order')
    expect(states()).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'active' })

    // The webhook and a second return both arrive after: same unit keys, nothing new.
    await huntsAfterOrderSession('cs_order')
    await huntsAfterOrderReturn('cs_order')
    expect(fake.tables.hunt_entitlements).toHaveLength(2)
    expect(fake.rpcCalls.filter((c) => c.fn === 'hunt_entitlement_project')).toHaveLength(6)
    expect(fake.tables.hunt_entitlements.every((e) => e.offer_id === 'offer-1' && e.benefit_code === 'tee-pickup' && e.profile_id === 'buyer-1')).toBe(true)
  })

  it('projects nothing for an order that is not paid, a session that is not an order, or while the switch is off', async () => {
    fake.tables.commerce_orders[0].status = 'pending'
    await huntsAfterOrderReturn('cs_order')
    await huntsAfterOrderReturn('cs_someone_else')
    fake.tables.commerce_orders[0].status = 'paid'
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    await huntsAfterOrderReturn('cs_order')
    expect(fake.tables.hunt_entitlements).toEqual([])
  })

  it('is what the real by-id settle calls, after the order is recorded', async () => {
    vi.resetModules()
    const seen: string[] = []
    vi.doMock('@/lib/billing/stripe', () => ({
      appUrl: () => 'https://frequencylocal.com',
      stripe: { checkout: { sessions: { retrieve: async (id: string) => ({ id, metadata: { kind: 'commerce_order' }, payment_status: id === 'cs_unpaid' ? 'unpaid' : 'paid', payment_intent: 'pi_order', amount_total: 5000, currency: 'usd' }) } } },
    }))
    vi.doMock('./merch-hooks', () => ({ huntsAfterOrderReturn: async (id: string) => { seen.push(id) } }))
    const { recordCommerceOrderFromSessionId } = await import('@/lib/commerce/checkout')
    expect(await recordCommerceOrderFromSessionId('cs_unpaid')).toBe(false)
    expect(seen).toEqual([])
    expect(await recordCommerceOrderFromSessionId('cs_order')).toBe(true)
    expect(seen).toEqual(['cs_order'])
    vi.doUnmock('@/lib/billing/stripe')
    vi.doUnmock('./merch-hooks')
  })
})

describe('a refunded unit revokes only its own', () => {
  beforeEach(async () => {
    await huntsAfterOrderReturn('cs_order')
  })

  it('one refunded unit of the quantity-two line revokes that unit and leaves the other active', async () => {
    const out = await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_1' })
    expect(out).toEqual({ ok: true, units: [`${LINE}:2`], revoked: 1, cases: 0 })
    expect(states()).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'revoked' })
  })

  it('the same refund delivered again does not reach for the next unit', async () => {
    await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_1' })
    const again = await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_1' })
    expect(again).toEqual({ ok: true, units: [`${LINE}:2`], revoked: 0, cases: 0 })
    expect(states()).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'revoked' })
    // A revoked unit is never reopened by a late paid delivery.
    await huntsAfterOrderReturn('cs_order')
    expect(states()[`${LINE}:2`]).toBe('revoked')
  })

  it('a second, different refund takes the remaining unit, and a third finds nothing left', async () => {
    await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_1' })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_2' })).toMatchObject({ ok: true, units: [`${LINE}:1`], revoked: 1 })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_unit_3' })).toEqual({ ok: false, error: 'That line has no Hunt benefit left to revoke.' })
  })

  it('takes the unused unit before a consumed one, and a consumed unit opens a case and keeps its history', async () => {
    fake.tables.hunt_entitlements.find((e) => e.unit_key === `${LINE}:2`)!.state = 'consumed'
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_a' })).toMatchObject({ ok: true, units: [`${LINE}:1`], revoked: 1, cases: 0 })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_b' })).toMatchObject({ ok: true, units: [`${LINE}:2`], revoked: 0, cases: 1 })
    expect(states()[`${LINE}:2`]).toBe('consumed')
    expect(fake.tables.hunt_refund_cases).toMatchObject([{ kind: 'consumed_reversal', unit_key: `${LINE}:2`, ref: `re_b:${LINE}:2` }])
  })

  it('refuses a line with no benefit, more units than the line has, a bad reference, and everything while the switch is off', async () => {
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: PLAIN, count: 1, ref: 're_x' })).toMatchObject({ ok: false })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 3, ref: 're_x' })).toEqual({ ok: false, error: 'That line has only 2 units with a Hunt benefit.' })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: '100%' })).toMatchObject({ ok: false })
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 0, ref: 're_x' })).toMatchObject({ ok: false })
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    expect(await revokeOrderLineUnits({ orderId: ORDER, lineId: LINE, count: 1, ref: 're_x' })).toEqual({ ok: false, error: 'Hunt commerce is off.' })
    expect(Object.values(states())).toEqual(['active', 'active'])
  })
})

describe('the player store link', () => {
  it('links an approved, in-stock item sold by the offer’s seller to the canonical store page', async () => {
    expect(await storeLinksForHunt('hunt-1')).toEqual([{ offerId: 'offer-1', title: 'Trail tee', href: '/market/prod-tee', includesBenefit: true }])
  })

  it('keeps the name and drops the purchase action when the item cannot be bought', async () => {
    const product = fake.tables.commerce_products[0]
    for (const change of [{ stock: 0 }, { status: 'archived' }, { owner_space_id: 'space-other' }]) {
      Object.assign(product, { stock: 4, status: 'active', owner_space_id: 'space-1' }, change)
      expect(await storeLinksForHunt('hunt-1')).toEqual([{ offerId: 'offer-1', title: 'Trail tee', href: null, includesBenefit: true }])
    }
  })

  it('resolves the exact variant an offer names, and never falls through to another', async () => {
    fake.tables.hunt_store_offers = [offer({ variant_id: 'var-m', benefit_code: null })]
    expect(await storeLinksForHunt('hunt-1')).toEqual([{ offerId: 'offer-1', title: 'Trail tee', href: null, includesBenefit: false }])
    fake.tables.commerce_variants = [{ id: 'var-m', product_id: 'prod-tee', active: true, stock: 1 }]
    expect((await storeLinksForHunt('hunt-1'))[0].href).toBe('/market/prod-tee')
    fake.tables.commerce_variants[0].active = false
    expect((await storeLinksForHunt('hunt-1'))[0].href).toBeNull()
  })

  it('shows nothing for a withdrawn offer, another Hunt, or while the switch is off', async () => {
    expect(await storeLinksForHunt('hunt-2')).toEqual([])
    fake.tables.hunt_store_offers[0].status = 'withdrawn'
    expect(await storeLinksForHunt('hunt-1')).toEqual([])
    fake.tables.hunt_store_offers[0].status = 'approved'
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    expect(await storeLinksForHunt('hunt-1')).toEqual([])
  })
})
