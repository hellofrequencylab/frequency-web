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
/** The member take-rate as a RECORDING fake: 8% of whatever gross it is handed, so the fee/currency
 *  test below can tie the `application_fee_amount` Stripe receives back to the line items' cents. */
const memberTakeRate = vi.hoisted(() => ({ cents: vi.fn(async (gross: number) => Math.floor(gross * 0.08)) }))
vi.mock('./fees', () => ({
  platformFeeCents: () => 0,
  platformFeePct: () => 10,
  spaceTakeRateCents: async () => 0,
  memberTakeRateCents: (gross: number, ...rest: unknown[]) => memberTakeRate.cents(gross, ...rest),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const created = () => stripeFake.checkout.sessions.create.mock.calls[0][0] as any

beforeEach(() => {
  state.reset()
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.expire.mockReset()
  connect.status = { accountId: 'acct_host', ready: true }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('hosted mode stays exactly as it was (the default, and the fallback)', () => {
  it('sends success_url and cancel_url, and NEVER ui_mode or return_url', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })

    expect(created().success_url).toContain('/events/sunrise-session?ticket=success')
    expect(created().cancel_url).toBe('https://app.test/events/sunrise-session')
    expect(created().ui_mode, 'hosted must not send ui_mode').toBeUndefined()
    expect(created().return_url, 'hosted must not send return_url').toBeUndefined()
    expect(out).toEqual({ url: 'https://stripe.test/cs_1' })
  })

  it('is what an omitted `ui` option gets, so no existing caller changed behaviour', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(created().ui_mode).toBeUndefined()
  })
})

describe("ui: 'elements' asks Stripe for an on-page session", () => {
  it("sends ui_mode 'elements' and return_url, and NEVER success_url or cancel_url", async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null, client_secret: 'cs_secret_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })

    // The value is 'elements', not 'custom'. Confirmed from the installed client SDK, whose own
    // docstring reads: initCheckoutElementsSdk ... for the Elements integration pattern
    // (ui_mode: "elements"). @stripe/stripe-js knows only 'elements' and 'form'.
    expect(created().ui_mode).toBe('elements')
    // Stripe REJECTS these two in a non-hosted mode. Sending them is a 400 on a money path.
    expect(created().success_url, 'success_url is rejected under ui_mode elements').toBeUndefined()
    expect(created().cancel_url, 'cancel_url is rejected under ui_mode elements').toBeUndefined()
  })

  it('🔴 keeps session_id={CHECKOUT_SESSION_ID} on return_url -- the webhook-independent reconcile', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null, client_secret: 'cs_secret_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })

    // Without this placeholder the success page cannot settle the ticket itself and the buyer
    // waits on a webhook. app/(main)/events/[slug]/page.tsx reads it and calls
    // recordTicketFromSessionId.
    expect(created().return_url).toContain('session_id={CHECKOUT_SESSION_ID}')
    expect(created().return_url).toContain('ticket=success')
    expect(created().return_url).toContain('/events/sunrise-session')
  })

  it('returns the client secret instead of a url', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null, client_secret: 'cs_secret_1' })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    expect(out).toEqual({ clientSecret: 'cs_secret_1', sessionId: 'cs_1' })
    expect(out.url, 'exactly one of url / clientSecret is ever set').toBeUndefined()
  })

  // 🔴 THE SESSION ID IS LOAD-BEARING ON THIS PATH, and it is the one field whose absence is
  // invisible. `confirm({ redirect: 'if_required' })` means the buyer never navigates, so the
  // `return_url` asserted above -- the webhook's backstop -- is NEVER VISITED on the common card
  // path. The id handed back here is what lets the caller settle from its own success handler
  // instead, through the same recordTicketFromSession the webhook uses. Drop it and an on-page
  // purchase has exactly one way to become real, behind a confirmation panel that already
  // promised a ticket (LIVE-366).
  it('hands back the session id, so an on-page purchase can settle without the webhook', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_live_abc', url: null, client_secret: 'cs_live_abc_secret_xyz' })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    expect(out.sessionId).toBe('cs_live_abc')
  })

  // The hosted half of the same contract: it has a url whose landing page already carries the id
  // in its query string, so handing one back here would be a second, redundant settle trigger.
  it('does NOT hand back a session id on the hosted path', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_2', url: 'https://stripe.test/pay', client_secret: null })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'hosted' })
    expect(out.url).toBe('https://stripe.test/pay')
    expect(out.sessionId).toBeUndefined()
  })
})

describe('🔴 the degrade: an on-page request that Stripe will not honour still sells a ticket', () => {
  it('falls back to the hosted url when no client_secret comes back', async () => {
    flatEvent()
    // Whatever the reason -- an API version that does not know the mode, a rejected field, a
    // Stripe-side change -- the buyer must still be able to pay.
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    expect(out).toEqual({ url: 'https://stripe.test/cs_1' })
  })

  it('says so in the log rather than degrading silently', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    // A swallowed downgrade is an invisible regression: on-page checkout would quietly stop
    // existing and the only symptom would be a redirect nobody reported.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('no client_secret'),
      expect.objectContaining({ sessionId: 'cs_1' }),
    )
  })

  it('does NOT log a downgrade on an ordinary hosted call', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1' })
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('the mode changes nothing else about the sale', () => {
  it('carries the same metadata, fee and transfer as hosted', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null, client_secret: 'cs_secret_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })

    // The nine creator/recorder metadata contracts (HYG-098) must survive the swap: the webhook
    // finds a ticket by metadata.kind, not by which UI the buyer saw.
    expect(created().metadata.kind).toBe('ticket')
    expect(created().metadata.event_id).toBe('evt-1')
    expect(created().metadata.buyer_profile_id).toBe('buyer-1')
    expect(created().payment_intent_data.metadata.kind).toBe('ticket')
    expect(created().payment_intent_data.transfer_data.destination).toBe('acct_host')
    expect(created().mode).toBe('payment')
  })

  it('prices the fee on the line items\' own cents, in their currency (HYG-107, ADR-1500)', async () => {
    // `application_fee_amount` is an integer Stripe reads in the PaymentIntent's currency, which under
    // Adaptive Pricing stays the line items' currency (the buyer's local price is presentment only).
    // So the cut is right exactly when fee and line items share cents and currency. Pinned here for
    // tickets as lib/commerce/checkout-fee-currency.test.ts pins it for the shop.
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' })
    memberTakeRate.cents.mockClear()
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', qty: 2 })
    const lines = created().line_items as { quantity: number; price_data: { currency: string; unit_amount: number } }[]
    expect(lines.length).toBeGreaterThan(0)
    const lineGross = lines.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0)
    expect(lineGross).toBe(2 * 2500)
    for (const l of lines) expect(l.price_data.currency).toBe('usd')
    expect(memberTakeRate.cents).toHaveBeenCalledTimes(1)
    expect(memberTakeRate.cents.mock.calls[0][0]).toBe(lineGross)
    expect(created().payment_intent_data.application_fee_amount).toBe(Math.floor(lineGross * 0.08))
    expect(created().payment_intent_data.application_fee_amount).toBe(await memberTakeRate.cents.mock.results[0].value)
  })

  it('still narrows payment methods and still holds the seat for 30 minutes', async () => {
    flatEvent()
    stripeFake.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null, client_secret: 'cs_secret_1' })
    await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    // LIVE-343: timed inventory takes instant money, in either UI.
    expect(created().payment_method_types).toEqual(['card', 'link'])
    expect(typeof created().expires_at).toBe('number')
  })

  it('refuses a host with no Connect account in elements mode too', async () => {
    flatEvent()
    connect.status = { accountId: null, ready: false }
    const out = await createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'evt-1', ui: 'elements' })
    expect(out.error).toBe(TICKETS_NOT_READY)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})
