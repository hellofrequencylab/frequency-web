import { describe, it, expect, vi, beforeEach } from 'vitest'

// EACH SELLER SENDS THEIR OWN SHARE OF A SPLIT ORDER (LIVE-705, ADR-1652).
//
// A split order (owner_kind 'split', funds_flow 'separate') names no owner, so setOrderFulfillment,
// which finds an order through the owner columns, refused every seller it pays: "That order is not
// one of yours." These tests pin, against a table-aware mock that APPLIES every filter it is handed
// (a read that forgets to scope by seller finds the other seller's row and fails here):
//   1. a Space and a maker each move their OWN share, on their transfer row, and nothing else;
//   2. the order rolls up to the least advanced share with something to send, forward only, and a
//      paid order closes as fulfilled once every such share is delivered;
//   3. no seller reaches another seller's share (another Space, the Space's owner as a maker);
//   4. an operator moves any share by naming its row, and only on that order;
//   5. the buyer hears once per share shipped, naming that seller and their lines only;
//   6. a single-seller order takes the old path and never reads the transfer ledger;
//   7. the reads: a seller's view carries their step, the buyer's read each seller's step.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let reads: string[] = []
let writes: { table: string; patch: Row }[] = []
// Called after a compare-and-set's filters are built and before they are applied: a test moves the
// row underneath to prove the write refuses to land on a step it did not read.
let beforeWrite: ((table: string) => void) | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Row) => ((patch = p), chain),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          reads.push(table)
          return { data: matching()[0] ?? null, error: null }
        },
        then: (resolve: (v: { data: Row[] | null; error: null }) => unknown) => {
          if (patch) {
            beforeWrite?.(table)
            const hit = matching()
            for (const r of hit) Object.assign(r, patch)
            writes.push({ table, patch })
            return Promise.resolve(resolve({ data: hit.map((r) => ({ id: r.id })), error: null }))
          }
          reads.push(table)
          return Promise.resolve(resolve({ data: matching(), error: null }))
        },
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn(async () => ({ enqueuedCount: 1, outcomes: [] })) }))
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => 'buyer@example.test' }))
vi.mock('@/lib/billing/stripe', () => ({ appUrl: () => 'https://freq.test' }))
vi.mock('@/lib/billing/receipt-email', () => ({
  displayNameFor: async (id: string | null) => (id === 'profile-b' ? 'Mara Okafor' : 'Ada'),
  receiptDate: () => 'September 29, 2026',
  receiptHtml: (c: { lead: string }) => `<p>${c.lead}</p>`,
  receiptText: (c: { lead: string }) => c.lead,
  spaceReceiptTarget: async (id: string) => ({ ownerProfileId: 'profile-owner', name: id === 'space-a' ? 'Riverbend Studio' : 'Other', slug: 'x' }),
}))

import { routeNotification } from '@/lib/notifications/router'
import { setOrderFulfillment, rollupShareFulfilment, lineIsShares } from './fulfilment'
import { listOrdersForBuyer, listSpaceOrders, splitShareFulfilments } from './orders'

const SPACE_A = { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'space-a' }
const MAKER_B = { owner_kind: 'profile', owner_profile_id: 'profile-b', owner_space_id: null }
const product = (kind: string, owner: Row) => ({ product_kind: kind, ...owner })

function splitOrder(over: Row = {}): Row {
  return {
    id: 'o-split',
    buyer_profile_id: 'buyer-1',
    guest_email: null,
    owner_kind: 'split',
    owner_profile_id: null,
    owner_space_id: null,
    amount_cents: 10000,
    platform_fee_cents: 1000,
    currency: 'usd',
    status: 'paid',
    fulfillment_status: 'none',
    shipping: { address: { city: 'Austin' } },
    created_at: '2026-09-20T10:00:00Z',
    paid_at: '2026-09-20T10:01:00Z',
    refunded_at: null,
    funds_flow: 'separate',
    metadata: { split: [{}, {}] },
    commerce_order_items: [
      { id: 'i-mug', title: 'Stoneware mug', qty: 2, unit_cents: 3000, subtotal_cents: 6000, commerce_products: product('physical', SPACE_A) },
      { id: 'i-print', title: 'Riso print', qty: 1, unit_cents: 4000, subtotal_cents: 4000, commerce_products: product('physical', MAKER_B) },
    ],
    ...over,
  }
}

const items = (bKind = 'physical'): Row[] => [
  { order_id: 'o-split', title: 'Stoneware mug', qty: 2, commerce_products: product('physical', SPACE_A) },
  { order_id: 'o-split', title: 'Riso print', qty: 1, commerce_products: product(bKind, MAKER_B) },
  { order_id: 'o-dest', title: 'Beeswax candle', qty: 1, commerce_products: product('physical', SPACE_A) },
]

const shares = (): Row[] => [
  {
    id: 't-a',
    order_id: 'o-split',
    ...SPACE_A,
    amount_cents: 5400,
    platform_fee_cents: 600,
    reversed_cents: 0,
    status: 'created',
    fulfillment_status: 'none',
    fulfilment: null,
    created_at: '2026-09-20T10:02:00Z',
  },
  {
    id: 't-b',
    order_id: 'o-split',
    ...MAKER_B,
    amount_cents: 3600,
    platform_fee_cents: 400,
    reversed_cents: 0,
    status: 'created',
    fulfillment_status: 'none',
    fulfilment: null,
    created_at: '2026-09-20T10:02:01Z',
  },
]

const destinationOrder = (): Row => ({
  ...splitOrder(),
  id: 'o-dest',
  owner_kind: 'space',
  owner_space_id: 'space-a',
  funds_flow: 'destination',
  metadata: {},
  commerce_order_items: [],
})

const order = (id = 'o-split') => tables.commerce_orders.find((o) => o.id === id)!
const share = (id: string) => tables.commerce_order_transfers.find((t) => t.id === id)!
const noNotify = { notifyShipped: vi.fn(async () => undefined) }
const asSpace = { kind: 'space' as const, spaceId: 'space-a' }
const asMaker = { kind: 'profile' as const, profileId: 'profile-b' }

beforeEach(() => {
  vi.clearAllMocks()
  reads = []
  writes = []
  beforeWrite = null
  tables = {
    commerce_orders: [splitOrder(), destinationOrder()],
    commerce_order_transfers: shares(),
    commerce_order_items: items(),
  }
})

describe('a seller moves their own share of a split order', () => {
  it('a Space marks its share shipped on its transfer row; the other share and the order do not move', async () => {
    const res = await setOrderFulfillment('o-split', { status: 'shipped', carrier: 'USPS', tracking: '9400 1' }, asSpace, noNotify)
    expect(res).toMatchObject({ ok: true, order: { shareId: 't-a', fulfillmentStatus: 'shipped', orderFulfillmentStatus: 'none', status: 'paid' } })
    expect(share('t-a').fulfillment_status).toBe('shipped')
    expect(share('t-a').fulfilment).toMatchObject({ carrier: 'USPS', tracking: '9400 1', status: 'shipped' })
    expect(share('t-b').fulfillment_status).toBe('none')
    // One seller shipping is not the order shipping: the maker has not sent theirs.
    expect(order().fulfillment_status).toBe('none')
    expect(order().shipping).toEqual({ address: { city: 'Austin' } })
  })

  it('the order reads shipped once every share is, and closes as fulfilled once every share is delivered', async () => {
    await setOrderFulfillment('o-split', { status: 'shipped' }, asSpace, noNotify)
    const b = await setOrderFulfillment('o-split', { status: 'shipped' }, asMaker, noNotify)
    expect(b).toMatchObject({ ok: true, order: { shareId: 't-b', orderFulfillmentStatus: 'shipped' } })
    expect(order().fulfillment_status).toBe('shipped')
    expect(order().status).toBe('paid')

    await setOrderFulfillment('o-split', { status: 'delivered' }, asSpace, noNotify)
    expect(order().fulfillment_status).toBe('shipped')
    expect(order().status).toBe('paid')
    const last = await setOrderFulfillment('o-split', { status: 'delivered' }, asMaker, noNotify)
    expect(last).toMatchObject({ ok: true, order: { status: 'fulfilled', orderFulfillmentStatus: 'delivered' } })
    expect(order().fulfillment_status).toBe('delivered')
    expect(order().status).toBe('fulfilled')
  })

  it('a share with nothing to send is refused and never holds the order back', async () => {
    tables.commerce_order_items = items('service')
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, asMaker, noNotify)).toEqual({
      ok: false,
      error: 'Nothing in this share needs sending.',
    })
    await setOrderFulfillment('o-split', { status: 'delivered' }, asSpace, noNotify)
    expect(order().fulfillment_status).toBe('delivered')
    expect(order().status).toBe('fulfilled')
  })

  it('each share only moves forward, and a step read stale does not land', async () => {
    await setOrderFulfillment('o-split', { status: 'delivered' }, asSpace, noNotify)
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, asSpace, noNotify)).toMatchObject({
      ok: false,
      error: expect.stringContaining('only moves forward'),
    })
    beforeWrite = (t) => {
      if (t === 'commerce_order_transfers') share('t-b').fulfillment_status = 'shipped'
    }
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, asMaker, noNotify)).toMatchObject({
      ok: false,
      error: expect.stringContaining('Someone else updated'),
    })
  })

  it('the roll-up never pulls the order back from a step it already reached', async () => {
    order().fulfillment_status = 'delivered'
    const res = await setOrderFulfillment('o-split', { status: 'shipped' }, asSpace, noNotify)
    expect(res).toMatchObject({ ok: true, order: { orderFulfillmentStatus: 'delivered' } })
    expect(order().fulfillment_status).toBe('delivered')
    expect(writes.filter((w) => w.table === 'commerce_orders')).toEqual([])
  })

  it('a refunded order, or a share paid back, has nothing to send', async () => {
    order().status = 'refunded'
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, asSpace, noNotify)).toMatchObject({
      ok: false,
      error: expect.stringContaining('refunded'),
    })
    order().status = 'paid'
    share('t-a').status = 'reversed'
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, asSpace, noNotify)).toEqual({
      ok: false,
      error: 'This share was paid back, so there is nothing to send.',
    })
    expect(writes).toEqual([])
  })
})

describe('no seller reaches another seller\'s share', () => {
  it('another Space, the Space\'s owner as a maker, and the Store door all find nothing', async () => {
    const other = await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'space', spaceId: 'space-z' }, noNotify)
    // The Space's owner is a profile, but the Space's row is a Space's: kind is matched, not just the id.
    tables.commerce_order_transfers.find((t) => t.id === 't-a')!.owner_profile_id = 'profile-owner'
    const owner = await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'profile', profileId: 'profile-owner' }, noNotify)
    const store = await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'platform' }, noNotify)
    for (const r of [other, owner, store]) expect(r).toEqual({ ok: false, error: 'That order is not one of yours.' })
    expect(writes).toEqual([])
  })

  it('a line is a share\'s only when its kind AND that kind\'s owner id match', () => {
    const spaceShare = { owner_kind: 'space', owner_profile_id: 'profile-owner', owner_space_id: 'space-a' }
    expect(lineIsShares({ seller: { kind: 'space', profileId: null, spaceId: 'space-a' } }, spaceShare)).toBe(true)
    expect(lineIsShares({ seller: { kind: 'profile', profileId: 'profile-owner', spaceId: null } }, spaceShare)).toBe(false)
    expect(lineIsShares({ seller: null }, spaceShare)).toBe(false)
  })
})

describe('an operator marks any share', () => {
  it('moves the share it names, and rolls the order up', async () => {
    await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'operator', shareId: 't-a' }, noNotify)
    const res = await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'operator', shareId: 't-b' }, noNotify)
    expect(res).toMatchObject({ ok: true, order: { shareId: 't-b', orderFulfillmentStatus: 'shipped' } })
    expect(order().fulfillment_status).toBe('shipped')
  })

  it('a share id from another order, no share id, or a single-seller order finds nothing', async () => {
    expect(await setOrderFulfillment('o-dest', { status: 'shipped' }, { kind: 'operator', shareId: 't-a' }, noNotify)).toEqual({
      ok: false,
      error: 'That order is not one of yours.',
    })
    expect(await setOrderFulfillment('o-split', { status: 'shipped' }, { kind: 'operator', shareId: '' }, noNotify)).toMatchObject({ ok: false })
    expect(writes).toEqual([])
  })
})

describe('the buyer hears once per share shipped', () => {
  it('names the seller that shipped and lists their lines only', async () => {
    await setOrderFulfillment('o-split', { status: 'shipped', carrier: 'USPS', tracking: '9400 1' }, asMaker)
    expect(routeNotification).toHaveBeenCalledTimes(1)
    const [, , payload] = vi.mocked(routeNotification).mock.calls[0] as unknown as [string, unknown, { body: string; email?: { html: string } }]
    expect(payload.body).toContain('Mara Okafor')
    expect(payload.email?.html).toContain('Riso print')
    expect(payload.email?.html).not.toContain('Stoneware mug')

    await setOrderFulfillment('o-split', { status: 'delivered' }, asMaker)
    expect(routeNotification).toHaveBeenCalledTimes(1)
  })
})

describe('a single-seller order is unchanged', () => {
  it('its seller moves it on the order row and the transfer ledger is never read', async () => {
    const res = await setOrderFulfillment('o-dest', { status: 'shipped', carrier: 'UPS', tracking: '1Z' }, asSpace, noNotify)
    expect(res).toMatchObject({ ok: true, order: { id: 'o-dest', fulfillmentStatus: 'shipped' } })
    expect(res.ok && res.order.shareId).toBeFalsy()
    expect(order('o-dest').fulfillment_status).toBe('shipped')
    expect(reads).not.toContain('commerce_order_transfers')
    expect(writes.map((w) => w.table)).toEqual(['commerce_orders'])
  })
})

describe('the roll-up', () => {
  it('is the least advanced share, and none when there is nothing to send', () => {
    expect(rollupShareFulfilment([])).toBe('none')
    expect(rollupShareFulfilment(['shipped', 'none'])).toBe('none')
    expect(rollupShareFulfilment(['shipped', 'delivered'])).toBe('shipped')
    expect(rollupShareFulfilment(['completed', 'delivered'])).toBe('delivered')
    expect(rollupShareFulfilment(['completed', 'bogus'])).toBe('none')
  })
})

describe('the reads carry each share\'s step', () => {
  it('a Space sees its own step on its share, not the order roll-up', async () => {
    await setOrderFulfillment('o-split', { status: 'shipped', carrier: 'USPS', tracking: '9400 1' }, asSpace, noNotify)
    const mine = (await listSpaceOrders('space-a')).find((o) => o.id === 'o-split')!
    expect(mine.share).not.toBeNull()
    expect(mine.fulfillmentStatus).toBe('shipped')
    expect(mine.fulfilment.tracking).toBe('9400 1')
    expect(mine.items.map((i) => i.id)).toEqual(['i-mug'])
  })

  it('the buyer reads each seller\'s step beside their lines, and no row id or money figure', async () => {
    await setOrderFulfillment('o-split', { status: 'shipped', carrier: 'USPS', tracking: '9400 1' }, asSpace, noNotify)
    const orders = await listOrdersForBuyer('buyer-1')
    const split = orders.find((o) => o.id === 'o-split')!
    expect(split.sellerFulfilments).toEqual([
      expect.objectContaining({ seller: { kind: 'space', profileId: null, spaceId: 'space-a' }, fulfillmentStatus: 'shipped' }),
      expect.objectContaining({ seller: { kind: 'profile', profileId: 'profile-b', spaceId: null }, fulfillmentStatus: 'none' }),
    ])
    expect(JSON.stringify(split.sellerFulfilments)).not.toMatch(/t-a|shareId|amount/)
    expect(orders.find((o) => o.id === 'o-dest')!.sellerFulfilments).toBeUndefined()
  })

  it('the operator read names each share\'s row', async () => {
    const map = await splitShareFulfilments(['o-split'])
    expect(map.get('o-split')!.map((s) => s.shareId)).toEqual(['t-a', 't-b'])
  })
})
