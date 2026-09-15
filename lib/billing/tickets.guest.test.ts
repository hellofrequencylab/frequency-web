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
      update: () => b,
      eq: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(state.read(table)),
      rpc: async (name: string, args: Record<string, unknown>) => state.rpc(name, args),
    }
    return b
  },
}))

import { TICKETS_NOT_READY } from '@/lib/events/ticket-eligibility'
import { createTicketCheckout, TICKET_PMC_ENV } from './tickets'

const GUEST = 'sam@example.com'

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

/** An event hosted BY a Space, so the space-membership gate has a Space to resolve. The one row
 *  answers both `spaces` reads the checkout makes (the payee lookup and the name lookup). */
const SPACE_EVENT = { ...EVENT, space_id: 'sp-1', host_space_id: 'sp-1' }
const SPACE_ROW = { owner_profile_id: 'host-1', name: 'Royal Temple', brand_name: null, plan: 'free', network_connected: true }

function tier(over: Record<string, unknown> = {}) {
  return {
    id: 'tt-1',
    event_id: 'evt-1',
    name: 'General',
    pricing_mode: 'fixed',
    price_cents: 2500,
    min_cents: null,
    suggested_cents: null,
    quantity: null,
    sold: 0,
    member_only: false,
    space_members_only: false,
    space_tier_id: null,
    active: true,
    ...over,
  }
}

/** The plain flat-price event: no tier row is ever requested. */
function flatEvent() {
  state.setHandler((t) => (t === 'events' ? { data: EVENT, error: null } : { data: null, error: null }))
}

const created = () => stripeFake.checkout.sessions.create.mock.calls[0][0] as Record<string, never>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meta = () => (created() as any).metadata as Record<string, string>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const piMeta = () => (created() as any).payment_intent_data.metadata as Record<string, string>

beforeEach(() => {
  state.reset()
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.expire.mockReset()
  stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
  connect.status = { accountId: 'acct_host', ready: true }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createTicketCheckout — exactly one identity', () => {
  it('refuses when BOTH a profile and a guest email are supplied, before touching Stripe', async () => {
    flatEvent()
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', guestEmail: GUEST, eventId: 'evt-1' })
    expect(out.error).toBe('Could not start checkout. Please try again.')
    expect(out.url).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
    // A caller cannot act on this line, so the real reason goes to the log, not to the reader.
    expect(console.error).toHaveBeenCalled()
  })

  it('refuses when NEITHER is supplied, before touching Stripe', async () => {
    flatEvent()
    const out = await createTicketCheckout({ eventId: 'evt-1' })
    expect(out.error).toBe('Could not start checkout. Please try again.')
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('treats a blank/whitespace guest email as NO identity rather than as an identity', async () => {
    flatEvent()
    const out = await createTicketCheckout({ guestEmail: '   ', eventId: 'evt-1' })
    expect(out.error).toBe('Could not start checkout. Please try again.')
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('does not read the event at all on a malformed identity (the refusal is first)', async () => {
    flatEvent()
    await createTicketCheckout({ eventId: 'evt-1' })
    expect(state.reads).toHaveLength(0)
  })
})

describe('createTicketCheckout — a guest is refused every gated tier', () => {
  it('refuses a member_only tier for a guest, and issues NO profiles read for one', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ member_only: true }), error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out.error).toBe('This ticket is for members only.')
    // A guest has no profile: asking the database would only make the refusal look measured.
    expect(state.reads).not.toContain('profiles')
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses a space_members_only tier for a guest, naming the Space, with NO membership read', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: SPACE_EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ space_members_only: true }), error: null }
      if (t === 'spaces') return { data: SPACE_ROW, error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out.error).toContain('Royal Temple')
    expect(state.reads).not.toContain('space_memberships')
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses a tier that names a specific membership tier, even with the flag off', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: SPACE_EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ space_members_only: false, space_tier_id: 'mt-1' }), error: null }
      if (t === 'spaces') return { data: SPACE_ROW, error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out.error).toContain('Royal Temple')
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses an inactive tier, a sold-out tier and an amount under the floor, same as a member', async () => {
    const withTier = (over: Record<string, unknown>) =>
      state.setHandler((t) => {
        if (t === 'events') return { data: EVENT, error: null }
        if (t === 'event_ticket_types') return { data: tier(over), error: null }
        return { data: null, error: null }
      })

    withTier({ active: false })
    expect((await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })).error)
      .toBe('That ticket type is no longer on sale.')

    withTier({ quantity: 2, sold: 2 })
    expect((await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })).error)
      .toBe('This ticket type is sold out.')

    withTier({ pricing_mode: 'pwyc', price_cents: null, min_cents: 1000 })
    expect((await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1', amountCents: 500 })).error)
      .toBe('Minimum is $10.00.')

    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refuses when the payee is not payouts-ready, with the same neutral line a member gets', async () => {
    // The buyer is a stranger either way and is never told anything about the host's account.
    flatEvent()
    connect.status = { accountId: 'acct_host', ready: false }
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1' })
    expect(out.error).toBe(TICKETS_NOT_READY)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe('createTicketCheckout — the guest session and the guest reservation', () => {
  it('carries the guest email as customer_email and in BOTH metadata blocks, with no buyer_profile_id', async () => {
    flatEvent()
    const out = await createTicketCheckout({ guestEmail: ' Sam@Example.COM ', eventId: 'evt-1' })
    expect(out).toEqual({ url: 'https://stripe.test/cs_1' })

    // Normalised once, at the boundary, and the SAME normalised string everywhere.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((created() as any).customer_email).toBe(GUEST)
    expect(meta().guest_email).toBe(GUEST)
    expect(piMeta().guest_email).toBe(GUEST)
    expect(meta()).not.toHaveProperty('buyer_profile_id')
    expect(piMeta()).not.toHaveProperty('buyer_profile_id')
    expect(meta().kind).toBe('ticket')
    expect(piMeta().event_id).toBe('evt-1')
  })

  it('leaves success_url and cancel_url exactly as the member path has them', async () => {
    flatEvent()
    await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = created() as any
    expect(s.success_url).toBe('https://app.test/events/sunrise-session?ticket=success&session_id={CHECKOUT_SESSION_ID}')
    expect(s.cancel_url).toBe('https://app.test/events/sunrise-session')
  })

  it('reserves with _buyer null and the guest address', async () => {
    flatEvent()
    await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', qty: 2 })
    expect(state.rpcCalls).toHaveLength(1)
    const { name, args } = state.rpcCalls[0]
    expect(name).toBe('reserve_ticket_atomic')
    expect(args._buyer).toBeNull()
    expect(args._guest_email).toBe(GUEST)
    expect(args._qty).toBe(2)
    expect(args._session_id).toBe('cs_1')
  })

  it('expires the session and refuses the URL when the reservation is lost', async () => {
    flatEvent()
    state.setReserve({ data: { reserved: false, reason: 'sold_out' }, error: null })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1' })
    expect(out.error).toBe('This ticket just sold out.')
    expect(out.url).toBeUndefined()
    expect(stripeFake.checkout.sessions.expire).toHaveBeenCalledWith('cs_1')
  })
})

describe('createTicketCheckout: a free tier for a guest is the same answer a member gets (LIVE-318)', () => {
  it('returns a bare { free: true } for a guest, creates no session and reserves nothing', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ pricing_mode: 'free', price_cents: 0 }), error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out).toEqual({ free: true })
    // The discriminant that used to say "sign in to claim it" is gone: the caller holds the
    // identity and records the claim itself (submitGuestRsvp with the tier id for a guest).
    expect('requiresAccount' in out).toBe(false)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('a members-only FREE tier is still refused for a guest, before the free branch', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ pricing_mode: 'free', price_cents: 0, member_only: true }), error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out.error).toBe('This ticket is for members only.')
    expect(out.free).toBeUndefined()
  })
})

describe('createTicketCheckout — THE MEMBER PATH IS UNCHANGED (regression)', () => {
  it('sets no customer_email and no guest_email, and keeps buyer_profile_id in both blocks', async () => {
    flatEvent()
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(out).toEqual({ url: 'https://stripe.test/cs_1' })
    expect(created()).not.toHaveProperty('customer_email')
    expect(meta().buyer_profile_id).toBe('buyer-1')
    expect(piMeta().buyer_profile_id).toBe('buyer-1')
    expect(meta()).not.toHaveProperty('guest_email')
    expect(piMeta()).not.toHaveProperty('guest_email')
  })

  it('calls reserve_ticket_atomic with the SAME argument list as before: no _guest_email KEY at all', async () => {
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    const { args } = state.rpcCalls[0]
    expect(args._buyer).toBe('buyer-1')
    // Absent, not null: the SQL default applies and the member call is what it always was.
    expect(args).not.toHaveProperty('_guest_email')
    expect(Object.keys(args).sort()).toEqual(
      ['_amount_cents', '_buyer', '_currency', '_event_id', '_fee_cents', '_qty', '_session_id', '_tier_id'],
    )
  })

  it('a free tier for a MEMBER still returns a bare { free: true }', async () => {
    state.setHandler((t) => {
      if (t === 'events') return { data: EVENT, error: null }
      if (t === 'event_ticket_types') return { data: tier({ pricing_mode: 'free', price_cents: 0 }), error: null }
      return { data: null, error: null }
    })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ticketTypeId: 'tt-1' })
    expect(out).toEqual({ free: true })
  })

  it('still refuses the host buying their own ticket', async () => {
    flatEvent()
    const out = await createTicketCheckout({ buyerProfileId: 'host-1', eventId: 'evt-1' })
    expect(out.error).toBe('You’re hosting this event.')
  })
})

// ── A ticket is TIMED INVENTORY, so its session is shaped differently to every other one ────────

describe('createTicketCheckout — instant money only (LIVE-343)', () => {
  it('narrows the ticket session to card + link when no configuration id is set', async () => {
    delete process.env[TICKET_PMC_ENV]
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = created() as any
    // A delayed-notification method completes this session WITHOUT paying and settles days later,
    // which is the mechanism behind the oversell. It cannot share a product with a 30 minute hold.
    expect(s.payment_method_types).toEqual(['card', 'link'])
    expect(s).not.toHaveProperty('payment_method_configuration')
  })

  it('hands the Stripe dashboard back control when a configuration id IS set', async () => {
    process.env[TICKET_PMC_ENV] = 'pmc_instant_only'
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = created() as any
    expect(s.payment_method_configuration).toBe('pmc_instant_only')
    // Stripe rejects a request carrying both, so the hardcoded list must be gone entirely.
    expect(s).not.toHaveProperty('payment_method_types')
    delete process.env[TICKET_PMC_ENV]
  })

  it('keeps the 30 minute hold, which is the thing the narrowing protects', async () => {
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (created() as any).expires_at).toBe('number')
  })
})

describe("createTicketCheckout — Stripe's own receipt, as the backstop to ours", () => {
  it('addresses a GUEST receipt to the normalised address the ticket is written against', async () => {
    flatEvent()
    await createTicketCheckout({ guestEmail: ' Sam@Example.COM ', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((created() as any).payment_intent_data.receipt_email).toBe(GUEST)
  })

  it("addresses a MEMBER receipt to their PROVEN account address, never to client input", async () => {
    accountEmail.value = 'buyer@example.com'
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = created() as any
    expect(s.payment_intent_data.receipt_email).toBe('buyer@example.com')
    // Same reason `customer_email` stays guest-only: a member's receipt must not be routable by
    // anything a form supplied.
    expect(s).not.toHaveProperty('customer_email')
  })

  it('omits the field rather than sending a null when the member has no readable address', async () => {
    accountEmail.value = null
    flatEvent()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((created() as any).payment_intent_data).not.toHaveProperty('receipt_email')
    accountEmail.value = 'buyer@example.com'
  })

  it('lives on the PaymentIntent, not the session: a Checkout Session has no receipt_email', async () => {
    flatEvent()
    await createTicketCheckout({ guestEmail: GUEST, eventId: 'evt-1' })
    expect(created()).not.toHaveProperty('receipt_email')
  })
})
