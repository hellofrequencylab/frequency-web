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
/** What `journeySlugsForOrder` answers per order id (PROG-GD5); unlisted orders bought no Journey. */
const slugsByOrder = new Map<string, string[]>()
const journeySlugsForOrder = vi.fn(async (orderId: string) => slugsByOrder.get(orderId) ?? [])
vi.mock('./journey-fulfilment', () => ({
  enrolByOrder: (id: string) => enrolByOrder(id),
  journeySlugsForOrder: (id: string) => journeySlugsForOrder(id),
}))

import { claimGuestOrdersOnSignIn } from './claim-guest-orders-on-sign-in'

function client(result: unknown) {
  const rpc = vi.fn(async () => result as never)
  return { rpc } as unknown as Parameters<typeof claimGuestOrdersOnSignIn>[0] & { rpc: typeof rpc }
}

beforeEach(() => {
  enrolByOrder.mockClear()
  journeySlugsForOrder.mockClear()
  slugsByOrder.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── THE LANDING (PROG-GD5) ───────────────────────────────────────────────────────────────────────
// The commonest guest opens the magic link in a different browser than the one that paid, arrives
// with no cookie and no ?next=, and would otherwise land on /feed with a Journey they paid for and
// no sign of it. So a claim that attached a Journey names its welcome; the callback fills only the
// default with it. Null on every other path, so "nowhere in particular" and "it failed" read the
// same to the login path, which must never fail over a landing.
describe('claimGuestOrdersOnSignIn — the landing', () => {
  it('names the welcome of the first claimed Journey, after the enrolments have run', async () => {
    slugsByOrder.set('order-1', ['heart-on-fire'])
    const c = client({ data: ['order-1'], error: null })
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBe('/journeys/heart-on-fire/welcome')
    // Enrol first, land second: the welcome page checks the enrolment, so it must exist by then.
    expect(enrolByOrder.mock.invocationCallOrder[0]).toBeLessThan(journeySlugsForOrder.mock.invocationCallOrder[0])
  })

  it('the oldest purchase is the landing; a later one is not lost, only not first', async () => {
    slugsByOrder.set('order-1', ['first'])
    slugsByOrder.set('order-2', ['second'])
    await expect(claimGuestOrdersOnSignIn(client({ data: ['order-1', 'order-2'], error: null }))).resolves.toBe(
      '/journeys/first/welcome',
    )
  })

  it('skips a claimed order that bought no Journey and lands on the next one that did', async () => {
    slugsByOrder.set('order-2', ['second'])
    await expect(claimGuestOrdersOnSignIn(client({ data: ['order-1', 'order-2'], error: null }))).resolves.toBe(
      '/journeys/second/welcome',
    )
  })

  it('lands nowhere when nothing was claimed, and when what was claimed was not a Journey', async () => {
    await expect(claimGuestOrdersOnSignIn(client({ data: [], error: null }))).resolves.toBeNull()
    expect(journeySlugsForOrder).not.toHaveBeenCalled()
    await expect(claimGuestOrdersOnSignIn(client({ data: ['order-1'], error: null }))).resolves.toBeNull()
  })

  it('🔴 never lands on a Journey whose enrolment threw: the welcome would refuse it', async () => {
    enrolByOrder.mockImplementationOnce(async () => {
      throw new Error('plan deleted')
    })
    slugsByOrder.set('bad', ['gone'])
    slugsByOrder.set('good', ['kept'])
    await expect(claimGuestOrdersOnSignIn(client({ data: ['bad', 'good'], error: null }))).resolves.toBe(
      '/journeys/kept/welcome',
    )
    expect(journeySlugsForOrder).not.toHaveBeenCalledWith('bad')
  })
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
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeNull()
    expect(enrolByOrder).not.toHaveBeenCalled()
  })

  it('swallows a thrown RPC rather than failing the sign-in', async () => {
    const c = { rpc: vi.fn(async () => { throw new Error('unreachable') }) } as never
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeNull()
    expect(enrolByOrder).not.toHaveBeenCalled()
  })

  it('one failing order does not strand the rest', async () => {
    enrolByOrder.mockImplementationOnce(async () => {
      throw new Error('plan deleted')
    })
    const c = client({ data: ['bad', 'good'], error: null })
    await expect(claimGuestOrdersOnSignIn(c)).resolves.toBeNull()
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
