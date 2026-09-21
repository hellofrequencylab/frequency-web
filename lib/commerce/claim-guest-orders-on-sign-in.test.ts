import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE ORDER CLAIM LEG (LIVE-396). What these pin, in the order they matter:
//   * the RPC is called with NO arguments (ADR-854: a typed address keys nothing);
//   * every claimed id is fulfilled through the ORDINARY enrolByOrder, because adoptPlan is the
//     single authority for what enrolling means and SQL alone would skip the practices;
//   * one failing order does not strand the others;
//   * every failure path is swallowed — the caller is the auth callback, and a failed login costs
//     more than an unattached order, which the next sign-in recovers.
//
// `enrolByOrder` is stubbed: what it does with an order is proven in the commerce fulfilment tests.

const enrolByOrder = vi.fn(async (_orderId: string) => {})
vi.mock('./journey-fulfilment', () => ({
  enrolByOrder: (id: string) => enrolByOrder(id),
}))

import { claimGuestOrdersOnSignIn } from './claim-guest-orders-on-sign-in'

function client(result: unknown) {
  const rpc = vi.fn(async () => result as never)
  return { rpc } as unknown as Parameters<typeof claimGuestOrdersOnSignIn>[0] & { rpc: typeof rpc }
}

beforeEach(() => {
  enrolByOrder.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimGuestOrdersOnSignIn', () => {
  it('calls the RPC with no arguments at all', async () => {
    const c = client({ data: [], error: null })
    await claimGuestOrdersOnSignIn(c)
    expect(c.rpc).toHaveBeenCalledTimes(1)
    expect(c.rpc).toHaveBeenCalledWith('claim_guest_orders')
  })

  it('fulfils every claimed order through the ordinary path', async () => {
    const c = client({ data: ['order-1', 'order-2'], error: null })
    await claimGuestOrdersOnSignIn(c)
    expect(enrolByOrder).toHaveBeenCalledTimes(2)
    expect(enrolByOrder).toHaveBeenNthCalledWith(1, 'order-1')
    expect(enrolByOrder).toHaveBeenNthCalledWith(2, 'order-2')
  })

  it('reads the single-column object shape PostgREST may return instead of bare strings', async () => {
    const c = client({ data: [{ claim_guest_orders: 'order-9' }], error: null })
    await claimGuestOrdersOnSignIn(c)
    expect(enrolByOrder).toHaveBeenCalledWith('order-9')
  })

  it('claims nothing and fulfils nothing when the address proved nobody', async () => {
    const c = client({ data: [], error: null })
    await claimGuestOrdersOnSignIn(c)
    expect(enrolByOrder).not.toHaveBeenCalled()
  })

  it('does not fulfil when the RPC reports an error', async () => {
    const c = client({ data: ['order-1'], error: { message: 'permission denied' } })
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeUndefined()
    expect(enrolByOrder).not.toHaveBeenCalled()
  })

  it('swallows a thrown RPC rather than failing the sign-in', async () => {
    const c = { rpc: vi.fn(async () => { throw new Error('unreachable') }) } as never
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeUndefined()
    expect(enrolByOrder).not.toHaveBeenCalled()
  })

  it('one failing order does not strand the rest', async () => {
    enrolByOrder.mockImplementationOnce(async () => {
      throw new Error('plan deleted')
    })
    const c = client({ data: ['bad', 'good'], error: null })
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeUndefined()
    expect(enrolByOrder).toHaveBeenCalledTimes(2)
    expect(enrolByOrder).toHaveBeenNthCalledWith(2, 'good')
  })

  it('tolerates a malformed payload without enrolling anyone', async () => {
    for (const data of [null, undefined, 'nope', 42, [null], [{}], [{ n: 1 }]]) {
      enrolByOrder.mockClear()
      await claimGuestOrdersOnSignIn(client({ data, error: null }))
      expect(enrolByOrder).not.toHaveBeenCalled()
    }
  })
})
