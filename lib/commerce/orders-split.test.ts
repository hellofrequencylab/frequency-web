import { describe, it, expect, vi, beforeEach } from 'vitest'

// A SELLER'S SHARE OF A SPLIT ORDER (LIVE-624, ADR-1616).
//
// A split order names no owner (owner_kind 'split', both owner ids null), so every seller read keyed
// on the owner columns missed it: the Space Shop Orders tab, the maker console and the Space's
// earnings figures all read as if the sale never happened. Each seller's claim on it is their row in
// commerce_order_transfers. These tests pin, against a table-aware mock that APPLIES the filters it
// is handed (so a read that forgets to scope by seller returns the other seller's row and fails):
//   1. a seller sees the split order, as their share: their lines, their gross, their transfer state;
//   2. they never see the other seller's figures, lines, ids or error;
//   3. a destination order is unchanged and carries no share;
//   4. the Space's earnings sum the share, never the cart, and a refund comes off the share pro rata;
//   5. an unreadable ledger leaves the orders a seller owns on screen.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let failTable: string | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let cap = Infinity
      let range: [number, number] | null = null
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain),
        not: () => chain,
        or: () => chain,
        order: () => chain,
        range: (from: number, to: number) => { range = [from, to]; return chain },
        limit: (n: number) => ((cap = n), chain),
        then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
          if (failTable === table) return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }))
          const data = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, cap)
          return Promise.resolve(resolve({ data: range ? data.slice(range[0], range[1] + 1) : data, error: null }))
        },
      }
      return chain
    },
  }),
}))

import { listSpaceOrders, listOrdersForSeller, spaceEarningsSummary } from './orders'

const item = (id: string, title: string, cents: number, kind: string, owner: Row) => ({
  id,
  title,
  qty: 1,
  unit_cents: cents,
  subtotal_cents: cents,
  commerce_products: { product_kind: kind, ...owner },
})
const SPACE_A = { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'space-a' }
const MAKER_B = { owner_kind: 'profile', owner_profile_id: 'profile-b', owner_space_id: null }

function splitOrder(over: Row = {}): Row {
  return {
    id: 'o-split',
    buyer_profile_id: 'buyer-1',
    owner_kind: 'split',
    owner_profile_id: null,
    owner_space_id: null,
    amount_cents: 10000,
    platform_fee_cents: 1000,
    currency: 'usd',
    status: 'paid',
    fulfillment_status: 'none',
    shipping: {},
    created_at: '2026-09-20T10:00:00Z',
    paid_at: '2026-09-20T10:01:00Z',
    refunded_at: null,
    funds_flow: 'separate',
    source: 'self',
    metadata: {
      split: [
        { ...SPACE_A, stripe_account_id: 'acct_a', gross_cents: 6000, platform_fee_cents: 600 },
        { ...MAKER_B, stripe_account_id: 'acct_b', gross_cents: 4000, platform_fee_cents: 400 },
      ],
    },
    commerce_order_items: [item('i-mug', 'Stoneware mug', 6000, 'physical', SPACE_A), item('i-print', 'Riso print', 4000, 'digital', MAKER_B)],
    ...over,
  }
}

const destinationOrder: Row = {
  id: 'o-dest',
  buyer_profile_id: 'buyer-2',
  owner_kind: 'space',
  owner_profile_id: null,
  owner_space_id: 'space-a',
  amount_cents: 2500,
  platform_fee_cents: 250,
  currency: 'usd',
  status: 'paid',
  fulfillment_status: 'none',
  shipping: {},
  created_at: '2026-09-25T10:00:00Z',
  paid_at: '2026-09-25T10:01:00Z',
  refunded_at: null,
  funds_flow: 'destination',
  source: 'self',
  metadata: {},
  commerce_order_items: [item('i-candle', 'Beeswax candle', 2500, 'physical', SPACE_A)],
}

const transfers = (): Row[] => [
  {
    order_id: 'o-split',
    owner_kind: 'space',
    owner_profile_id: null,
    owner_space_id: 'space-a',
    amount_cents: 5400,
    platform_fee_cents: 600,
    reversed_cents: 0,
    status: 'created',
    last_error: null,
  },
  {
    order_id: 'o-split',
    owner_kind: 'profile',
    owner_profile_id: 'profile-b',
    owner_space_id: null,
    amount_cents: 3600,
    platform_fee_cents: 400,
    reversed_cents: 0,
    status: 'failed',
    last_error: 'account restricted',
  },
]

beforeEach(() => {
  failTable = null
  tables = { commerce_orders: [splitOrder(), destinationOrder], commerce_order_transfers: transfers() }
})

describe('a Space sees its share of a split order (LIVE-624)', () => {
  it('lists the split order beside the orders it owns, newest first, as its share', async () => {
    const orders = await listSpaceOrders('space-a')
    expect(orders.map((o) => o.id)).toEqual(['o-dest', 'o-split'])
    const split = orders[1]
    expect(split.share).toEqual({ grossCents: 6000, feeCents: 600, netCents: 5400, reversedCents: 0, transferStatus: 'created' })
    // Every existing sum over amountCents now adds the share, never the cart.
    expect(split.amountCents).toBe(6000)
    expect(split.platformFeeCents).toBe(600)
    expect(split.sellerCount).toBe(2)
    expect(split.items.map((it) => it.title)).toEqual(['Stoneware mug'])
    expect(split.needsFulfilment).toBe(true)
  })

  it('never carries the other seller: no lines, figures, ids or error of theirs', async () => {
    const [, split] = await listSpaceOrders('space-a')
    const seen = JSON.stringify(split)
    for (const other of ['profile-b', 'Riso print', 'account restricted', 'acct_b', '3600', '10000']) {
      expect(seen).not.toContain(other)
    }
  })

  it('a destination order reads exactly as before and carries no share', async () => {
    const [dest] = await listSpaceOrders('space-a')
    expect(dest.share).toBeNull()
    expect(dest.fundsFlow).toBe('destination')
    expect(dest.sellerCount).toBe(1)
    expect(dest.amountCents).toBe(2500)
  })

  it('a Space with no transfer rows gets its own orders only', async () => {
    tables.commerce_orders.push({ ...destinationOrder, id: 'o-other', owner_space_id: 'space-z' })
    const orders = await listSpaceOrders('space-z')
    expect(orders.map((o) => o.id)).toEqual(['o-other'])
  })

  it('an unreadable ledger leaves the orders the Space owns on screen', async () => {
    failTable = 'commerce_order_transfers'
    const orders = await listSpaceOrders('space-a')
    expect(orders.map((o) => o.id)).toEqual(['o-dest'])
  })
})

describe('a maker sees their share of the same order, and only theirs (LIVE-624)', () => {
  it('their lines, their gross, their failed transfer', async () => {
    const orders = await listOrdersForSeller('profile-b')
    expect(orders).toHaveLength(1)
    const [split] = orders
    expect(split.share).toEqual({ grossCents: 4000, feeCents: 400, netCents: 3600, reversedCents: 0, transferStatus: 'failed' })
    expect(split.amountCents).toBe(4000)
    expect(split.items.map((it) => it.title)).toEqual(['Riso print'])
    const seen = JSON.stringify(split)
    for (const other of ['space-a', 'Stoneware mug', '5400', 'acct_a', '10000']) expect(seen).not.toContain(other)
  })

  it('a transfer row is matched on kind as well as id, so a Space row never lands in a maker list', async () => {
    // The Space row also carries the maker's profile id, and is read LAST, so a read that matched on
    // the id alone would file the Space's share under the maker.
    tables.commerce_order_transfers[0].owner_profile_id = 'profile-b'
    tables.commerce_order_transfers.reverse()
    const [split] = await listOrdersForSeller('profile-b')
    expect(split.share?.netCents).toBe(3600)
  })
})

describe('spaceEarningsSummary sums the share, not the cart (LIVE-624)', () => {
  it('adds the Space share of a paid split order to its own orders', async () => {
    const e = await spaceEarningsSummary('space-a')
    expect(e.grossCents).toBe(2500 + 6000)
    expect(e.feeCents).toBe(250 + 600)
    expect(e.netCents).toBe(8500 - 850)
    expect(e.orderCount).toBe(2)
    // A split order records one source for the whole cart, so a share never counts as network.
    expect(e.networkGrossCents).toBe(0)
  })

  it('a refunded split order moves the share, not the cart, into refunded', async () => {
    tables.commerce_orders[0] = splitOrder({ status: 'refunded', refunded_at: '2026-09-22T00:00:00Z' })
    const e = await spaceEarningsSummary('space-a')
    expect(e.refundedCents).toBe(6000)
    expect(e.grossCents).toBe(2500)
  })

  it('a partial refund comes off the share pro rata to its part of the order', async () => {
    tables.commerce_orders[0] = splitOrder({ metadata: { ...(splitOrder().metadata as Row), refund: { kind: 'partial', refunded_cents: 5000 } } })
    const e = await spaceEarningsSummary('space-a')
    // 5000 of 10000 refunded; this share is 6000 of it, so 3000 back and 300 of its 600 fee.
    expect(e.refundedCents).toBe(3000)
    expect(e.grossCents).toBe(2500 + 3000)
    expect(e.feeCents).toBe(250 + 300)
  })

  it('an unreadable ledger returns the other arms, not zeros', async () => {
    failTable = 'commerce_order_transfers'
    const e = await spaceEarningsSummary('space-a')
    expect(e.grossCents).toBe(2500)
  })
})

describe('complete Collective earnings preserve the split share', () => {
  it('counts only this Space share and keeps split shares out of network attribution', async () => {
    expect(await spaceEarningsSummary('space-a', undefined, true)).toMatchObject({ grossCents: 8500, feeCents: 850, netCents: 7650, networkGrossCents: 0 })
  })
  it('preserves partial refunds on the share in complete mode', async () => {
    tables.commerce_orders[0] = splitOrder({ metadata: { refund: { kind: 'partial', refunded_cents: 5000 } } })
    expect(await spaceEarningsSummary('space-a', undefined, true)).toMatchObject({ refundedCents: 3000, grossCents: 5500, feeCents: 550 })
  })
  it('rejects unreadable split order detail rather than hiding that arm', async () => {
    tables.commerce_orders = [splitOrder()]
    failTable = 'commerce_orders'
    await expect(spaceEarningsSummary('space-a', undefined, true)).rejects.toThrow('boom')
  })
})
