import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — the two `profiles.membership_tier` reads inside createTicketCheckout.
//
// A PostgREST failure arrives in `error`, not as a throw, so both reads used to fall through their
// unchecked `data` as if the answer were known:
//
//   1. the member_only GATE (tickets.ts) defaulted the buyer's tier to 'free' and refused a paying
//      Crew member their own ticket with "This ticket is for members only." — a refusal they cannot
//      act on. DIRECTION: still fail CLOSED (never hand out a restricted ticket on an unknown tier),
//      but stop asserting the tier: say the check failed, so the member retries.
//   2. the FEE resolution defaulted the host's tier to null, which prices at the free rung's 10% on a
//      seller who paid to buy their rate down to 8%. DIRECTION: fail CLOSED on the TRANSACTION —
//      refuse the checkout rather than take real money at a rate we could not verify.
//
// Every Stripe/Connect/fee boundary is stubbed; the admin client is a table-keyed fake so a single
// test can make exactly one table's read fail.

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
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => null }))
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

const EVENT = {
  id: 'evt-1',
  title: 'Sunrise Session',
  slug: 'sunrise-session',
  price_cents: 2500,
  is_cancelled: false,
  ends_at: '2099-01-01T00:00:00.000Z',
  starts_at: '2099-01-01T00:00:00.000Z',
  host_id: 'host-1',
  space_id: null,
  host_space_id: null,
}

const MEMBER_ONLY_TIER = {
  id: 'tt-1',
  event_id: 'evt-1',
  name: 'Crew seat',
  pricing_mode: 'fixed',
  price_cents: 2500,
  min_cents: null,
  suggested_cents: null,
  quantity: null,
  sold: 0,
  member_only: true,
  space_members_only: false,
  space_tier_id: null,
  active: true,
}

beforeEach(() => {
  state.reset()
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createTicketCheckout — the member_only gate on an unreadable tier (SCAN-539)', () => {
  it('does not tell a member they are not a member: it says the check failed, and sells nothing', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: MEMBER_ONLY_TIER, error: null }
      if (t === 'profiles') return { data: null, error: { message: '57014 statement timeout' } }
      return { data: null, error: null }
    })

    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ticketTypeId: 'tt-1' })

    // Old behaviour: the unchecked null defaulted the tier to 'free' and returned the members-only
    // refusal, accusing a paying Crew member of not being a member.
    expect(out.error).not.toMatch(/for members only/)
    expect(out.error).toMatch(/try again/i)
    // Still FAIL CLOSED: no restricted ticket is sold on an unknown tier.
    expect(out.url).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('still refuses a genuinely free-tier buyer with the members-only line (clean read)', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: MEMBER_ONLY_TIER, error: null }
      if (t === 'profiles') return { data: { membership_tier: 'free' }, error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out.error).toMatch(/for members only/)
  })
})

describe('createTicketCheckout — the host fee tier on an unreadable read (SCAN-539)', () => {
  // The buyer's gate read and the host's fee read both hit `profiles`; here the tier is ungated, so the
  // gate never runs and the ONLY profiles read is the host's fee tier.
  const flatEventOnly = (profilesResult: Result) => (t: string): Result => {
    if (t === 'events') return { data: EVENT, error: null }
    if (t === 'profiles') return profilesResult
    return { data: null, error: null }
  }

  it('refuses the checkout rather than charging the free rung on an unverified rate', async () => {
    state.setHandler(flatEventOnly({ data: null, error: { message: '57014 statement timeout' } }))

    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })

    // Old behaviour: `payeeTier` fell through as null, the free rung's 10% was applied, and a Stripe
    // session was created charging a Crew host a rate they had paid to buy down.
    expect(out.url).toBeUndefined()
    expect(out.error).toMatch(/try again/i)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('still sells the ticket on a clean read', async () => {
    state.setHandler(flatEventOnly({ data: { membership_tier: 'crew' }, error: null }))
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out.url).toBe('https://stripe.test/cs_1')
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })
})
