import { describe, it, expect, beforeEach, vi } from 'vitest'
import Stripe from 'stripe'

// LIVE-215: the webhook accepts a signature from EITHER configured Stripe destination.
//
// Every money path is a destination charge, so nine of the ten subscribed events fire on the
// platform account and reach the destination scoped "Events from: Your account". A connected
// host's `account.updated` fires on the CONNECTED account, and only a destination scoped
// "Events from: Connected accounts" delivers it. Each destination signs with its own `whsec_`.
// A verifier that knows one secret 400s every delivery from the other destination, and that
// failure is silent: `Failed` climbs on a dashboard nobody watches while the product keeps a
// host's stale payout flags forever.
//
// The gate AGENTS.md asks for: a payload signed with the SECOND secret must verify and run the
// Connect handler. "The code compiles with two secrets" proves nothing, and so does a mocked
// constructEvent (route.test.ts mocks it to return a canned event). This suite uses the REAL
// Stripe SDK: a real HMAC on the wire, a real verifier behind the route, and a control that a
// signature from neither destination is still the 400 it always was.

// Hoisted because the `vi.mock` factory below reads the secrets, and factories run before this
// file's top-level bindings exist.
const H = vi.hoisted(() => ({
  PLATFORM_SECRET: 'whsec_platform_test_secret',
  CONNECT_SECRET: 'whsec_connect_test_secret',
  STRANGER_SECRET: 'whsec_nobody_configured_this',
  accounts: [] as string[], // connected account ids handed to persistAccount, in order
  claims: [] as Array<{ event_id: string; type: string }>, // idempotency claims written
}))
const { PLATFORM_SECRET, CONNECT_SECRET, STRANGER_SECRET } = H

// The REAL SDK behind the route, with a dummy key: `constructEvent` never calls Stripe, it only
// checks the HMAC over the raw body against the secret it is handed.
vi.mock('@/lib/billing/stripe', async () => {
  const { default: RealStripe } = await vi.importActual<typeof import('stripe')>('stripe')
  return {
    stripe: new RealStripe('sk_test_dummy_key_for_signature_tests'),
    STRIPE_WEBHOOK_SECRETS: [H.PLATFORM_SECRET, H.CONNECT_SECRET],
    tierForPrice: () => 'crew',
  }
})
vi.mock('@/lib/billing/connect', () => ({
  persistAccount: async (a: Stripe.Account) => { H.accounts.push(a.id) },
}))
vi.mock('@/lib/billing/space-subscriptions', () => ({
  routeSpaceSubscription: async () => false,
  subscriptionKind: () => undefined,
}))
vi.mock('@/lib/billing/tips', () => ({
  recordTipFromSession: async () => {},
  recordTipRefundFromCharge: async () => {},
}))
vi.mock('@/lib/billing/tickets', () => ({
  recordTicketFromSession: async () => {},
  recordTicketRefundFromCharge: async () => {},
}))
vi.mock('@/lib/billing/checkout', () => ({
  recordMembershipDuesFromInvoice: async () => {},
}))
vi.mock('@/lib/commerce/checkout', () => ({
  recordCommerceOrderFromSession: async () => {},
  recordCommerceRefundFromCharge: async () => {},
  abandonCommerceOrderFromSession: async () => {},
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: { event_id: string; type: string }) => {
        H.claims.push(row)
        return { error: null }
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ data: { applied: true }, error: null }),
  }),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

// Any Stripe instance can mint a test header: the signature is a function of (payload, secret)
// and nothing else, exactly as a destination signs it.
const signer = new Stripe('sk_test_dummy_key_for_signing_only')

/** A v1 `account.updated` as the Connect-scoped destination delivers it: a top-level `account`
 *  names the connected account the event fired on. */
function accountUpdatedPayload(eventId: string, accountId: string): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'account.updated',
    account: accountId,
    created: 1_700_000_000,
    livemode: false,
    data: { object: { id: accountId, object: 'account', charges_enabled: true, payouts_enabled: false } },
  })
}

function post(payload: string, secret: string) {
  return POST(
    new Request('http://t/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': signer.webhooks.generateTestHeaderString({ payload, secret }) },
      body: payload,
    }),
  )
}

beforeEach(() => {
  H.accounts = []
  H.claims = []
})

describe('stripe webhook — one URL, two signing secrets (LIVE-215)', () => {
  it('a delivery signed by the SECOND (Connect-scoped) secret verifies and reaches the Connect sync', async () => {
    const res = await post(accountUpdatedPayload('evt_connect_1', 'acct_connected_host'), CONNECT_SECRET)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    // Verified, claimed, and handled: the consequence the row names is that persistAccount has an
    // event to run on at all.
    expect(H.claims).toEqual([{ event_id: 'evt_connect_1', type: 'account.updated' }])
    expect(H.accounts).toEqual(['acct_connected_host'])
  })

  it('a delivery signed by the FIRST (platform-scoped) secret still verifies', async () => {
    const res = await post(accountUpdatedPayload('evt_platform_1', 'acct_platform_scope'), PLATFORM_SECRET)
    expect(res.status).toBe(200)
    expect(H.claims.map((c) => c.event_id)).toEqual(['evt_platform_1'])
    expect(H.accounts).toEqual(['acct_platform_scope'])
  })

  it('control: a delivery signed by NEITHER secret is a 400 and touches nothing', async () => {
    const res = await post(accountUpdatedPayload('evt_forged_1', 'acct_forged'), STRANGER_SECRET)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'invalid signature' })
    expect(H.claims).toEqual([])
    expect(H.accounts).toEqual([])
  })

  it('control: a valid signature over a DIFFERENT body is a 400 (the raw bytes are what is verified)', async () => {
    const signed = accountUpdatedPayload('evt_tamper_1', 'acct_tamper')
    const header = signer.webhooks.generateTestHeaderString({ payload: signed, secret: CONNECT_SECRET })
    const res = await POST(
      new Request('http://t/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: signed.replace('acct_tamper', 'acct_someone_else'),
      }),
    )
    expect(res.status).toBe(400)
    expect(H.claims).toEqual([])
  })
})
