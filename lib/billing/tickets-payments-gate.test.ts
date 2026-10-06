import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE PAYMENTS GATE ON THE TICKET BUY PATH (ADR-1709, LIVE-753). Only a Space on Business or above
// sells a paid ticket. A personal event (a Member or Crew host, root-stamped, no hosting Space) is
// refused; a free Space is refused; the platform's own event (hosted by the root Space) sells. The
// buyer sees the neutral sentence, and the structured refusal rides along for a host surface.

type Result = { data: unknown; error: { message: string } | null }

const state = vi.hoisted(() => {
  const reads: string[] = []
  let handler: (table: string) => Result = () => ({ data: null, error: null })
  return {
    reads,
    read(table: string): Result {
      reads.push(table)
      return handler(table)
    },
    setHandler(h: (table: string) => Result) {
      handler = h
    },
    reset() {
      reads.length = 0
      handler = () => ({ data: null, error: null })
    },
  }
})

const stripeFake = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
}))

vi.mock('./stripe', () => ({ stripe: stripeFake, appUrl: () => 'https://app.test' }))
vi.mock('@/lib/pricing/gates', async (orig) => ({
  ...((await orig()) as object),
  loadFeatureGateOverrides: async () => ({}),
}))
vi.mock('./connect', () => ({
  payoutsLive: async () => true,
  getConnectStatus: async () => ({ accountId: 'acct_host', ready: true }),
}))
vi.mock('./fees', () => ({
  platformFeeCents: () => 0,
  platformFeePct: () => 10,
  spaceTakeRateCents: async () => 0,
  memberTakeRateCents: async () => 800,
  resolvedNetworkRate: async () => ({}),
}))
vi.mock('./pricing-keys', () => ({
  networkTakeRateBpsForPlan: () => 500,
  memberNetworkTakeRateBps: () => 800,
}))
vi.mock('@/lib/commerce/order-source', () => ({
  classifyOrderSource: async () => ({ source: 'network', attributionRef: null }),
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root-space' }))
vi.mock('@/lib/finance/record', () => ({ recordFinancialTransaction: async () => {} }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    let table = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      from: (t: string) => {
        table = t
        return b
      },
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(state.read(table)),
      rpc: async () => ({ data: { reserved: true }, error: null }),
    }
    return b
  },
}))


import { createTicketCheckout } from './tickets'
import { PAYMENTS_BUYER_REFUSAL } from '@/lib/pricing/payments-copy'

const EVENT = {
  id: 'evt-1',
  title: 'Sunrise Session',
  slug: 'sunrise-session',
  price_cents: 2500,
  is_cancelled: false,
  ends_at: '2099-01-01T00:00:00.000Z',
  starts_at: '2099-01-01T00:00:00.000Z',
  host_id: 'host-1',
  space_id: 'root-space',
  host_space_id: null as string | null,
}

function world(event: typeof EVENT, plan: string | null) {
  state.setHandler((t) => {
    if (t === 'events') return { data: event, error: null }
    if (t === 'spaces') return { data: { owner_profile_id: 'host-1', plan, network_connected: true }, error: null }
    if (t === 'profiles') return { data: { membership_tier: 'free' }, error: null }
    return { data: null, error: null }
  })
}

beforeEach(() => {
  state.reset()
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createTicketCheckout asks the payments gate', () => {
  it('refuses a PERSONAL event (a Member or Crew host) and never reaches Stripe', async () => {
    world(EVENT, null)
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out.error).toBe(PAYMENTS_BUYER_REFUSAL)
    expect(out.refusal).toMatchObject({ code: 'payments_plan', scope: 'personal' })
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses a FREE Space event with a structured refusal for the host side', async () => {
    world({ ...EVENT, host_space_id: 'space-free' }, 'free')
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out.error).toBe(PAYMENTS_BUYER_REFUSAL)
    expect(out.refusal).toMatchObject({ code: 'payments_plan', scope: 'free_space', spaceId: 'space-free' })
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses a free-Space guest too, with the same neutral line', async () => {
    world({ ...EVENT, host_space_id: 'space-free' }, 'free')
    const out = await createTicketCheckout({ guestEmail: 'guest@example.com', eventId: 'evt-1' })
    expect(out.error).toBe(PAYMENTS_BUYER_REFUSAL)
  })

  it.each(['business', 'collective', 'nonprofit'])('sells on a %s Space', async (plan) => {
    world({ ...EVENT, host_space_id: 'space-paid' }, plan)
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out.refusal).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalled()
  })

  it('sells the platform root Space own event', async () => {
    world({ ...EVENT, host_space_id: 'root-space' }, null)
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out.refusal).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalled()
  })
})
