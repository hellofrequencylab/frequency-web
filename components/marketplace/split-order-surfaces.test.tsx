import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// THE SPLIT-ORDER SURFACES (LIVE-624, ADR-1616), rendered.
//   - The seller's share line shows their net, fee and payout state, and nothing on a destination order.
//   - The operator's /admin/marketplace/orders renders EVERY transfer row of a split order under
//     [data-order-transfers], with a retry door on the rows that have not landed, and renders no such
//     section for a destination order (whose ledger it never even asks for).

const { listAllOrders, orderStatusCounts, sellerNames, listOrderTransfers, retryOrderTransferAction } = vi.hoisted(() => {
  const retry = Object.assign(vi.fn(), { bind: (_: unknown, id: string) => Object.assign(async () => {}, { boundTo: id }) })
  return {
    listAllOrders: vi.fn(),
    orderStatusCounts: vi.fn(),
    sellerNames: vi.fn(),
    listOrderTransfers: vi.fn(),
    retryOrderTransferAction: retry,
  }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: vi.fn(async () => ({})) }))
vi.mock('@/components/templates', () => ({
  AdminTemplate: ({ children }: { children: ReactElement }) => <main>{children}</main>,
  AdminSection: ({ children }: { children: ReactElement }) => <section>{children}</section>,
}))
vi.mock('@/lib/commerce/orders', async (orig) => ({
  ...(await orig<typeof import('@/lib/commerce/orders')>()),
  listAllOrders,
  orderStatusCounts,
  sellerNames,
}))
vi.mock('@/lib/commerce/transfers', () => ({ listOrderTransfers, MAX_TRANSFER_ATTEMPTS: 8 }))
vi.mock('@/app/(main)/admin/marketplace/actions', () => ({
  refundOrderAction: { bind: () => async () => {} },
  setOrderFulfillmentAction: { bind: () => async () => {} },
  retryOrderTransferAction,
}))

import { OrderShareNote } from './order-share-note'
import { OrderTransferLedger } from './order-transfer-ledger'
import MarketplaceOrdersPage from '@/app/(main)/admin/marketplace/orders/page'
import type { CommerceOrder } from '@/lib/commerce/orders'
import type { OrderTransfer } from '@/lib/commerce/transfers'

function order(over: Partial<CommerceOrder> = {}): CommerceOrder {
  return {
    id: 'o-dest',
    buyerProfileId: 'buyer-1',
    ownerKind: 'space',
    ownerProfileId: null,
    ownerSpaceId: 'space-a',
    amountCents: 2500,
    platformFeeCents: 250,
    currency: 'usd',
    status: 'paid',
    fulfillmentStatus: 'none',
    fulfilment: { carrier: null, tracking: null, trackingUrl: null, note: null, shippedAt: null, deliveredAt: null, completedAt: null },
    needsFulfilment: false,
    ships: false,
    createdAt: '2026-09-25T10:00:00Z',
    paidAt: '2026-09-25T10:01:00Z',
    refundedAt: null,
    items: [],
    fundsFlow: 'destination',
    sellerCount: 1,
    share: null,
    ...over,
  }
}

const split = order({
  id: 'o-split',
  ownerKind: 'split',
  ownerSpaceId: null,
  amountCents: 10000,
  platformFeeCents: 1000,
  fundsFlow: 'separate',
  sellerCount: 2,
})

function transfer(over: Partial<OrderTransfer>): OrderTransfer {
  return {
    id: 't-a',
    orderId: 'o-split',
    ownerKind: 'space',
    ownerProfileId: null,
    ownerSpaceId: 'space-a',
    stripeAccountId: 'acct_a',
    amountCents: 5400,
    platformFeeCents: 600,
    currency: 'usd',
    status: 'created',
    stripeTransferId: 'tr_123',
    reversedCents: 0,
    attempts: 1,
    lastError: null,
    ...over,
  }
}

const ROWS = [
  transfer({}),
  transfer({
    id: 't-b',
    ownerKind: 'profile',
    ownerProfileId: 'profile-b',
    ownerSpaceId: null,
    stripeAccountId: 'acct_b',
    amountCents: 3600,
    platformFeeCents: 400,
    status: 'failed',
    stripeTransferId: null,
    attempts: 8,
    lastError: 'account restricted',
  }),
]

const html = (el: ReactElement) => renderToStaticMarkup(el)
const count = (s: string, needle: string) => s.split(needle).length - 1

describe('OrderShareNote: a seller sees their share and where it stands', () => {
  it('shows the net after the fee, the seller count and the payout state', () => {
    const out = html(
      <OrderShareNote
        order={order({
          fundsFlow: 'separate',
          sellerCount: 2,
          amountCents: 4000,
          share: { grossCents: 4000, feeCents: 400, netCents: 3600, reversedCents: 0, transferStatus: 'failed' },
        })}
      />,
    )
    expect(out).toContain('data-order-share="failed"')
    expect(out).toContain('Your share of a 2-seller order')
    expect(out).toContain('$36.00 to you after a')
    expect(out).toContain('$4.00')
    expect(out).toContain('retrying')
  })

  it('renders nothing on a destination order', () => {
    expect(html(<OrderShareNote order={order()} />)).toBe('')
  })
})

describe('OrderTransferLedger: the operator sees every row', () => {
  it('lists each seller with its state, attempts and error, and a retry only where it has not landed', () => {
    const out = html(
      <OrderTransferLedger
        transfers={ROWS}
        names={new Map([['space:space-a', 'Riverbend Studio'], ['profile:profile-b', 'Mara Okafor']])}
        retry={(id) => Object.assign(async () => {}, { id })}
      />,
    )
    expect(out).toContain('data-order-transfers="2"')
    expect(count(out, 'data-transfer-status=')).toBe(2)
    expect(out).toContain('Riverbend Studio')
    expect(out).toContain('Mara Okafor')
    expect(out).toContain('tr_123')
    expect(out).toContain('account restricted')
    // Eight attempts on an open row is past the ceiling: the operator reads Stuck, not Failed.
    expect(out).toContain('Stuck')
    expect(count(out, 'Retry transfer')).toBe(1)
  })

  it('says so when the ledger could not be read, never "no transfers"', () => {
    const out = html(<OrderTransferLedger transfers={null} names={new Map()} />)
    expect(out).toContain('data-order-transfers="unreadable"')
    expect(out).toContain('could not be read')
  })
})

describe('/admin/marketplace/orders: the split section is for split orders only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAllOrders.mockResolvedValue([order(), split])
    orderStatusCounts.mockResolvedValue({ paid: 2 })
    sellerNames.mockResolvedValue(new Map())
    listOrderTransfers.mockResolvedValue(ROWS)
  })

  it('renders every transfer of the split order and no section for the destination order', async () => {
    const out = html(await MarketplaceOrdersPage())
    expect(count(out, 'data-order-transfers=')).toBe(1)
    expect(count(out, 'data-transfer-status=')).toBe(2)
    expect(listOrderTransfers).toHaveBeenCalledTimes(1)
    expect(listOrderTransfers).toHaveBeenCalledWith('o-split')
  })

  it('a page of destination orders only renders no transfer section at all', async () => {
    listAllOrders.mockResolvedValue([order()])
    const out = html(await MarketplaceOrdersPage())
    expect(out).not.toContain('data-order-transfers')
    expect(listOrderTransfers).not.toHaveBeenCalled()
  })
})
