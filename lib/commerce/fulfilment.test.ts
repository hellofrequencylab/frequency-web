import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE FULFILMENT WRITER (LIVE-606, ADR-1575). Two things this file holds still:
//   1. the ladder only moves forward, and the door offers the right next step for what was sold;
//   2. the write is bound to the seller the action verified, so a Space cannot touch another Space's
//      order, and delivered/completed closes the sale as `fulfilled` without touching a refund.
// The admin client is a table-aware in-memory chain; the shipped notice is an injected seam.

const m = vi.hoisted(() => ({
  orders: [] as Record<string, unknown>[],
  items: [] as Record<string, unknown>[],
  updates: [] as { patch: Record<string, unknown>; filters: [string, string][] }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = (table: string) => {
      const filters: [string, string][] = []
      let patch: Record<string, unknown> | null = null
      const matches = (row: Record<string, unknown>) => filters.every(([k, v]) => String(row[k]) === v)
      const rows = () => (table === 'commerce_orders' ? m.orders : m.items).filter(matches)
      const self: Record<string, unknown> = {
        select: () => self,
        update: (p: Record<string, unknown>) => {
          patch = p
          return self
        },
        eq: (k: string, v: string) => {
          filters.push([k, v])
          return self
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (patch) {
            const hit = rows()
            for (const r of hit) Object.assign(r, patch)
            m.updates.push({ patch, filters: [...filters] })
            return Promise.resolve(resolve({ data: hit.map((r) => ({ id: r.id })), error: null }))
          }
          return Promise.resolve(resolve({ data: rows(), error: null }))
        },
      }
      return self
    }
    return { from: chain }
  },
}))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn(async () => ({ enqueuedCount: 1, outcomes: [] })) }))
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => 'buyer@example.test' }))
vi.mock('@/lib/billing/stripe', () => ({ appUrl: () => 'https://freq.test' }))
vi.mock('@/lib/billing/receipt-email', () => ({
  displayNameFor: async () => 'Ada',
  receiptDate: () => 'September 29, 2026',
  receiptHtml: (c: { lead: string }) => `<p>${c.lead}</p>`,
  receiptText: (c: { lead: string }) => c.lead,
  spaceReceiptTarget: async () => ({ ownerProfileId: 'owner-1', name: 'Blue Door', slug: 'blue-door' }),
}))

import { routeNotification } from '@/lib/notifications/router'
import { enqueueEmail } from '@/lib/email'
import {
  fulfillmentTransition,
  nextFulfillmentStep,
  orderNeedsFulfilment,
  orderShips,
  fulfilmentFromShipping,
  trackingUrlFor,
  setOrderFulfillment,
  notifyOrderShipped,
} from './fulfilment'

const paidSpaceOrder = () => ({
  id: 'order-1',
  status: 'paid',
  fulfillment_status: 'none',
  shipping: { address: { city: 'Austin' }, name: 'Ada' },
  buyer_profile_id: 'buyer-1',
  guest_email: null,
  owner_kind: 'space',
  owner_profile_id: null,
  owner_space_id: 'space-1',
})

beforeEach(() => {
  vi.clearAllMocks()
  m.orders = [paidSpaceOrder()]
  m.items = [{ order_id: 'order-1', title: 'Two mugs', qty: 2 }]
  m.updates = []
})

describe('the ladder', () => {
  it('moves forward and refuses the same step or a step back, with a sentence', () => {
    expect(fulfillmentTransition('none', 'shipped')).toEqual({ ok: true })
    expect(fulfillmentTransition('shipped', 'delivered')).toEqual({ ok: true })
    expect(fulfillmentTransition('shipped', 'shipped')).toMatchObject({ ok: false, error: expect.stringContaining('already') })
    expect(fulfillmentTransition('delivered', 'shipped')).toMatchObject({ ok: false, error: expect.stringContaining('only moves forward') })
  })

  it('offers shipped first for a physical order, delivered first for a digital one, nothing once complete', () => {
    expect(nextFulfillmentStep('none', { ships: true })).toBe('shipped')
    expect(nextFulfillmentStep('pending', { ships: true })).toBe('shipped')
    expect(nextFulfillmentStep('none', { ships: false })).toBe('delivered')
    expect(nextFulfillmentStep('shipped', { ships: true })).toBe('delivered')
    expect(nextFulfillmentStep('delivered', { ships: false })).toBe('completed')
    expect(nextFulfillmentStep('completed', { ships: true })).toBeNull()
  })

  it('a service, booking, ticket or Journey is never sent; a mug or a download is; an unknown kind defaults to sent', () => {
    expect(orderNeedsFulfilment(['service'])).toBe(false)
    expect(orderNeedsFulfilment(['booking', 'ticket', 'journey'])).toBe(false)
    expect(orderNeedsFulfilment(['physical'])).toBe(true)
    expect(orderNeedsFulfilment(['digital'])).toBe(true)
    expect(orderNeedsFulfilment([null])).toBe(true)
    expect(orderNeedsFulfilment([])).toBe(false)
    expect(orderShips(['digital'])).toBe(false)
    expect(orderShips(['digital', 'physical'])).toBe(true)
  })

  it('reads the fulfilment record back from the shipping jsonb and never throws on junk', () => {
    expect(fulfilmentFromShipping(null).carrier).toBeNull()
    expect(fulfilmentFromShipping('nope').tracking).toBeNull()
    expect(fulfilmentFromShipping({ address: {} }).shippedAt).toBeNull()
    const f = fulfilmentFromShipping({ fulfilment: { carrier: 'USPS', tracking: '9400 1', shippedAt: '2026-09-29T00:00:00Z' } })
    expect(f.carrier).toBe('USPS')
    expect(f.trackingUrl).toContain('usps.com')
    expect(f.shippedAt).toBe('2026-09-29T00:00:00Z')
  })

  it('links the carriers it knows and prints the rest as a bare number', () => {
    expect(trackingUrlFor('FedEx', '12')).toContain('fedex.com')
    expect(trackingUrlFor('Royal Mail', 'AB1')).toContain('royalmail.com')
    expect(trackingUrlFor('Pony Express', 'X')).toBeNull()
    expect(trackingUrlFor('UPS', '')).toBeNull()
  })
})

describe('setOrderFulfillment', () => {
  it('marks a paid order shipped, stamps carrier and tracking beside the address, and tells the buyer once', async () => {
    const notify = vi.fn<(input: unknown) => Promise<void>>(async () => undefined)
    const res = await setOrderFulfillment(
      'order-1',
      { status: 'shipped', carrier: ' USPS ', tracking: '9400 1000' },
      { kind: 'space', spaceId: 'space-1' },
      { notifyShipped: notify, now: () => new Date('2026-09-29T12:00:00Z') },
    )
    expect(res.ok).toBe(true)
    const row = m.orders[0]
    expect(row.fulfillment_status).toBe('shipped')
    expect(row.status).toBe('paid')
    const shipping = row.shipping as { address: unknown; fulfilment: Record<string, unknown> }
    expect(shipping.address).toEqual({ city: 'Austin' })
    expect(shipping.fulfilment).toMatchObject({ carrier: 'USPS', tracking: '9400 1000', status: 'shipped', shippedAt: '2026-09-29T12:00:00.000Z' })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ orderId: 'order-1', buyerProfileId: 'buyer-1', fulfilment: { carrier: 'USPS' } })
    // The write is bound to the seller AND to the step the seller saw.
    expect(m.updates[0].filters).toEqual(expect.arrayContaining([['owner_space_id', 'space-1'], ['fulfillment_status', 'none']]))
  })

  it('another Space, or a maker, finds nothing under that order id', async () => {
    const other = await setOrderFulfillment('order-1', { status: 'shipped' }, { kind: 'space', spaceId: 'space-2' })
    expect(other).toMatchObject({ ok: false, error: expect.stringContaining('not one of yours') })
    const maker = await setOrderFulfillment('order-1', { status: 'shipped' }, { kind: 'profile', profileId: 'maker-1' })
    expect(maker.ok).toBe(false)
    const platform = await setOrderFulfillment('order-1', { status: 'shipped' }, { kind: 'platform' })
    expect(platform.ok).toBe(false)
    expect(m.updates).toHaveLength(0)
    expect(m.orders[0].fulfillment_status).toBe('none')
  })

  it('refuses a step back and a repeat, and writes nothing', async () => {
    m.orders[0].fulfillment_status = 'delivered'
    const back = await setOrderFulfillment('order-1', { status: 'shipped' }, { kind: 'space', spaceId: 'space-1' })
    expect(back).toMatchObject({ ok: false, error: expect.stringContaining('only moves forward') })
    const same = await setOrderFulfillment('order-1', { status: 'delivered' }, { kind: 'space', spaceId: 'space-1' })
    expect(same).toMatchObject({ ok: false, error: expect.stringContaining('already') })
    expect(m.updates).toHaveLength(0)
  })

  it('delivered closes a paid order as fulfilled; completed on a fulfilled order leaves status alone', async () => {
    m.orders[0].fulfillment_status = 'shipped'
    const notify = vi.fn<(input: unknown) => Promise<void>>(async () => undefined)
    const delivered = await setOrderFulfillment('order-1', { status: 'delivered' }, { kind: 'space', spaceId: 'space-1' }, { notifyShipped: notify })
    expect(delivered).toMatchObject({ ok: true, order: { status: 'fulfilled', fulfillmentStatus: 'delivered' } })
    expect(m.orders[0].status).toBe('fulfilled')
    expect(notify).not.toHaveBeenCalled()
    const completed = await setOrderFulfillment('order-1', { status: 'completed' }, { kind: 'space', spaceId: 'space-1' })
    expect(completed.ok).toBe(true)
    expect(m.updates[1].patch).not.toHaveProperty('status')
    expect(m.orders[0].fulfillment_status).toBe('completed')
  })

  it('an unpaid, refunded or failed order has nothing to send', async () => {
    for (const [status, words] of [
      ['pending', 'not been paid'],
      ['refunded', 'refunded'],
      ['failed', 'never completed'],
      ['cancelled', 'never completed'],
    ] as const) {
      m.orders[0].status = status
      const res = await setOrderFulfillment('order-1', { status: 'shipped' }, { kind: 'space', spaceId: 'space-1' })
      expect(res).toMatchObject({ ok: false, error: expect.stringContaining(words) })
    }
    expect(m.updates).toHaveLength(0)
  })

  it('the operator door reaches a Frequency Store order and only that', async () => {
    m.orders = [{ ...paidSpaceOrder(), id: 'store-1', owner_kind: 'platform', owner_space_id: null }]
    const res = await setOrderFulfillment('store-1', { status: 'shipped', carrier: 'UPS', tracking: '1Z' }, { kind: 'platform' }, { notifyShipped: async () => undefined })
    expect(res.ok).toBe(true)
    expect(m.updates[0].filters).toEqual(expect.arrayContaining([['owner_kind', 'platform']]))
  })
})

describe('notifyOrderShipped', () => {
  const base = {
    orderId: 'order-1',
    ownerKind: 'space' as const,
    ownerProfileId: null,
    ownerSpaceId: 'space-1',
    fulfilment: {
      carrier: 'USPS',
      tracking: '9400',
      trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400',
      note: null,
      shippedAt: '2026-09-29T12:00:00Z',
      deliveredAt: null,
      completedAt: null,
    },
  }

  it('a member is routed through the registry as order.shipped, with the email rendered and the tracking link as the action', async () => {
    await notifyOrderShipped({ ...base, buyerProfileId: 'buyer-1', guestEmail: null })
    expect(routeNotification).toHaveBeenCalledTimes(1)
    const [event, recipient, ctx] = (routeNotification as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [
      string,
      { profileId: string; email: string },
      { title: string; body: string; email?: { to: string; subject: string; text: string } },
    ]
    expect(event).toBe('order.shipped')
    expect(recipient).toEqual({ profileId: 'buyer-1', email: 'buyer@example.test' })
    expect(ctx.body).toBe('Two mugs x2 is on its way from Blue Door.')
    expect(ctx.email?.to).toBe('buyer@example.test')
    expect(ctx.email?.subject).toBe('Two mugs x2 is on its way')
    expect(ctx.email?.text).toContain('on its way: Two mugs x2')
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('a guest has no switches, so the address they paid under goes to the outbox directly', async () => {
    await notifyOrderShipped({ ...base, buyerProfileId: null, guestEmail: 'guest@example.test' })
    expect(routeNotification).not.toHaveBeenCalled()
    expect(enqueueEmail).toHaveBeenCalledTimes(1)
    expect((enqueueEmail as unknown as { mock: { calls: [{ to: string }][] } }).mock.calls[0][0].to).toBe('guest@example.test')
  })

  it('nobody to tell is a logged miss, never a throw', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyOrderShipped({ ...base, buyerProfileId: null, guestEmail: null })).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
