// THE HOIST MUST BE TIMING-ONLY (LIVE-363).
//
// classifyOrderSource now STARTS ~200 lines before it is consumed, so its result is carried as a
// settled value rather than a live promise. The temptation in that shape is to `.catch()` into the
// classifier's own fail-safe (`self`, 0%) -- which would be a MONEY change smuggled in as a
// performance change: a platform that could not classify an order would silently stop collecting
// its fee, and nothing would report it.
//
// This file pins the opposite: a rejection still fails the checkout, exactly as it did when the
// call was awaited in place. Cloned from tickets-onpage.test.ts so the harness is identical and
// ONLY the classifier's behaviour differs.

// The ON-PAGE ticket checkout contract (LIVE-347, ADR pending).
//
// This file pins the ONE thing that decides whether a buyer stays on Frequency or is bounced to
// Stripe: which fields `createTicketCheckout` sends to `checkout.sessions.create`, and what it
// hands back. It matters more than usual here because the compiler cannot see any of it -- the
// installed `stripe` package ships NO type declarations, so `Stripe.*` is `any` and a wrong
// `ui_mode`, a `success_url` that Stripe rejects in a non-hosted mode, or a dropped
// `{CHECKOUT_SESSION_ID}` are all RUNTIME failures in a money path. See
// lib/billing/stripe-api-version.test.ts for the proof of that claim.
//
// The harness below is the one from tickets.guest.test.ts, reused deliberately: it is already
// proven against this function, and a second hand-rolled fake would be a second thing to be wrong.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE GUEST DOOR at the money boundary — `createTicketCheckout` with `guestEmail` instead of
// `buyerProfileId`. MONEY CODE, and the whole point of these tests is that a guest is NOT a
// cheaper kind of member: every server-side gate that refuses a signed-in stranger refuses a
// signed-out one, and the two membership gates refuse a guest by CONSTRUCTION (no read is even
// attempted, because there is no profile to read).
//
// What is pinned here:
//   1. EXACTLY ONE IDENTITY. Both supplied, or neither, is refused before Stripe is touched.
//   2. A `member_only` tier and a `space_members_only` tier are refused for a guest, and no
//      membership read is issued for one.
//   3. Inventory and the `min_cents` floor apply identically.
//   4. The Stripe session carries `customer_email` and `guest_email` in BOTH metadata blocks,
//      with `buyer_profile_id` ABSENT. Those key names are a contract with the settle webhook.
//   5. `reserve_ticket_atomic` is called with `_buyer: null` + `_guest_email`.
//   6. THE MEMBER PATH IS UNCHANGED: no `customer_email`, no `guest_email`, and the RPC argument
//      list does not even carry the `_guest_email` KEY (the SQL default applies).
//
// Mocking idiom is the sibling ./tickets-read-guards.test.ts: every Stripe/Connect/fee boundary is
// stubbed and the admin client is a table-keyed fake, so one test can shape exactly one read.

type Result = { data: unknown; error: { message: string } | null }

const state = vi.hoisted(() => {
  const reads: string[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  let handler: (table: string) => Result = () => ({ data: null, error: null })
  let reserve: Result = { data: { reserved: true }, error: null }
  return {
    reads,
    rpcCalls,
    read(table: string): Result {
      reads.push(table)
      return handler(table)
    },
    rpc(name: string, args: Record<string, unknown>): Result {
      rpcCalls.push({ name, args })
      return reserve
    },
    setHandler(h: (table: string) => Result) {
      handler = h
    },
    setReserve(r: Result) {
      reserve = r
    },
    reset() {
      reads.length = 0
      rpcCalls.length = 0
      handler = () => ({ data: null, error: null })
      reserve = { data: { reserved: true }, error: null }
    },
  }
})

const stripeFake = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
}))

/** The payee's Connect readiness, flipped per test. Ready by default. */
const connect = vi.hoisted(() => ({ status: { accountId: 'acct_host', ready: true } as { accountId: string | null; ready: boolean } }))

/** The MEMBER buyer's proven account address, for `receipt_email`. Mocked at the module seam rather
 *  than through the fake client because the real accessor reads `auth.users` through
 *  `auth.admin.getUserById`, which the table-keyed fake below deliberately does not model. */
const accountEmail = vi.hoisted(() => ({ value: 'buyer@example.com' as string | null }))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => accountEmail.value }))

vi.mock('./stripe', () => ({ stripe: stripeFake, appUrl: () => 'https://app.test' }))
vi.mock('./connect', () => ({
  payoutsLive: async () => true,
  getConnectStatus: async () => connect.status,
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
  classifyOrderSource: async () => {
    throw new Error('order-source is down')
  },
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
      update: () => b,
      eq: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(state.read(table)),
      rpc: async (name: string, args: Record<string, unknown>) => state.rpc(name, args),
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

/** The flat-price event: no tier row is ever requested. */
function flatEvent() {
  state.setHandler((t) => (t === 'events' ? { data: EVENT, error: null } : { data: null, error: null }))
}


beforeEach(() => {
  state.reset()
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.expire.mockReset()
  connect.status = { accountId: 'acct_host', ready: true }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a classifier failure still fails the checkout, it does not become a free ticket', () => {
  it('rejects rather than returning a session priced at a 0% fee', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    await expect(createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })).rejects.toThrow(
      'order-source is down',
    )
  })

  it('never reaches Stripe with a fee it could not justify', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' }).catch(() => {})
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})
