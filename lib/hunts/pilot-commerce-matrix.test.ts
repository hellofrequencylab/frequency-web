import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

// THE SIGNED TEST EVENT MATRIX (FH-041, docs/hunts/PILOT-COMMERCE.md).
//
// Every case posts a Stripe event to the REAL webhook handler (app/api/webhooks/stripe/route.ts), signed
// with a test secret by Stripe's own library and verified by the handler's own `constructEvent`. Nothing
// about the signature, the idempotency claim, the dispatch or the Hunt hooks is faked.
//
// What IS faked, and what that means for the claim:
//   - the canonical recorders (ticket and order settlement, refund, dispute) are small stand-ins that move
//     the canonical row the way the real ones do. They are proved by their own suites in lib/billing and
//     lib/commerce. This matrix is about what the Hunt layer does AFTER canonical state changes.
//   - the database is lib/hunts/fake-hunt-db.ts, a mirror of the four money functions. The SQL is proved
//     by pgTAP. A green matrix here is not a production acceptance run and no real card was charged.
//
// The matrix: paid, replay, refund (full and partial), dispute (lost and won), out-of-order delivery,
// for an Experience Pass ticket (two seats) and a store order (a quantity-two bound line).

const SECRET = 'whsec_pilot_matrix_test_secret'
const H = vi.hoisted(() => ({ client: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => H.client }))
vi.mock('@/lib/billing/stripe', async () => {
  const { default: StripeSdk } = await import('stripe')
  return { stripe: new StripeSdk('sk_test_pilot_matrix'), STRIPE_WEBHOOK_SECRETS: ['whsec_pilot_matrix_test_secret'], tierForPrice: () => 'crew' }
})
vi.mock('@/lib/billing/space-subscriptions', () => ({ routeSpaceSubscription: async () => false, subscriptionKind: () => undefined }))
vi.mock('@/lib/billing/connect', () => ({ persistAccount: async () => {} }))
vi.mock('@/lib/billing/tips', () => ({ recordTipFromSession: async () => {}, recordTipRefundFromCharge: async () => {}, abandonTipFromSession: async () => {} }))
vi.mock('@/lib/billing/checkout', () => ({ recordMembershipDuesFromInvoice: async () => {} }))
vi.mock('@/lib/commerce/transfers', () => ({ recordTransferCreated: async () => {}, recordTransferReversed: async () => {} }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))

type Session = { id: string; metadata?: Record<string, string>; payment_status?: string; payment_intent?: string }
type Charge = { payment_intent?: string; amount?: number; amount_refunded?: number }
type Dispute = { payment_intent?: string; status?: string }
const one = (table: string, col: string, val: unknown) => (H.tables[table] ?? []).find((r) => r[col] === val)

// The canonical ticket path: pending -> succeeded on a paid session, succeeded -> refunded on a FULL refund only.
vi.mock('@/lib/billing/tickets', () => ({
  recordTicketFromSession: async (s: Session) => {
    const t = one('event_tickets', 'stripe_checkout_session_id', s.id)
    if (s.metadata?.kind === 'ticket' && s.payment_status === 'paid' && t?.status === 'pending') Object.assign(t, { status: 'succeeded', stripe_payment_intent_id: s.payment_intent })
  },
  recordTicketRefundFromCharge: async (c: Charge) => {
    const t = one('event_tickets', 'stripe_payment_intent_id', c.payment_intent)
    if (t?.status === 'succeeded' && (c.amount_refunded ?? 0) >= (c.amount ?? 0)) Object.assign(t, { status: 'refunded', refunded_at: '2026-11-16T00:00:00Z' })
  },
  abandonTicketFromSession: async () => {},
}))
// The canonical store path: pending -> paid, paid -> refunded on a full refund or a lost dispute.
vi.mock('@/lib/commerce/checkout', () => ({
  recordCommerceOrderFromSession: async (s: Session) => {
    const o = one('commerce_orders', 'stripe_checkout_session_id', s.id)
    if (s.metadata?.kind === 'commerce_order' && s.payment_status === 'paid' && o?.status === 'pending') Object.assign(o, { status: 'paid', stripe_payment_intent_id: s.payment_intent })
  },
  recordCommerceRefundFromCharge: async (c: Charge) => {
    const o = one('commerce_orders', 'stripe_payment_intent_id', c.payment_intent)
    if (o?.status === 'paid' && (c.amount_refunded ?? 0) >= (c.amount ?? 0)) o.status = 'refunded'
  },
  recordCommerceDisputeClosed: async (d: Dispute) => {
    const o = one('commerce_orders', 'stripe_payment_intent_id', d.payment_intent)
    if (o?.status === 'paid' && d.status === 'lost') o.status = 'refunded'
  },
  abandonCommerceOrderFromSession: async () => {},
}))

import { POST } from '@/app/api/webhooks/stripe/route'
import { createFakeHuntDb } from './fake-hunt-db'

const fake = createFakeHuntDb()
H.client = fake.client
H.tables = fake.tables
const signer = new Stripe('sk_test_pilot_matrix')

const TICKET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORDER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LINE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PASS_TOTAL = 9_000
const ORDER_TOTAL = 6_000

let seq = 0
/** Post one event, signed the way Stripe signs it. A fixed `id` is a redelivery of the same event. */
async function deliver(type: string, object: Record<string, unknown>, opts: { id?: string; secret?: string } = {}) {
  const payload = JSON.stringify({ id: opts.id ?? `evt_matrix_${++seq}`, object: 'event', type, created: 1_800_000_000 + seq, data: { object } })
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET })
  const res = await POST(new Request('http://t/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': signature }, body: payload }))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const ticketPaid = (id?: string) => deliver('checkout.session.completed', { id: 'cs_pass', object: 'checkout.session', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_pass', amount_total: PASS_TOTAL, currency: 'usd', metadata: { kind: 'ticket' } }, { id })
const orderPaid = (id?: string) => deliver('checkout.session.completed', { id: 'cs_order', object: 'checkout.session', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_order', amount_total: ORDER_TOTAL, currency: 'usd', metadata: { kind: 'commerce_order' } }, { id })
const refund = (pi: string, amount: number, refunded: number, id?: string) => deliver('charge.refunded', { id: `ch_${pi}`, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded, currency: 'usd', metadata: {} }, { id })
const disputeClosed = (pi: string, status: 'lost' | 'won') => deliver('charge.dispute.closed', { id: `dp_${pi}_${status}`, object: 'dispute', payment_intent: pi, status, amount: 1, currency: 'usd', metadata: {} })

const benefits = (sourceId: string) => Object.fromEntries(fake.tables.hunt_entitlements.filter((e) => e.source_id === sourceId).map((e) => [e.unit_key, e.state]))
const cases = () => fake.tables.hunt_refund_cases.map((c) => ({ source: c.source_type, kind: c.kind, amount: c.amount_minor }))

beforeEach(() => {
  seq = 0
  fake.reset({
    stripe_webhook_events: [],
    events: [{ id: 'ev-dinner', space_id: 'space-1', host_space_id: 'space-1' }],
    event_ticket_types: [{ id: 'tier-pass', event_id: 'ev-dinner', pricing_mode: 'fixed', price_cents: 4_500 }],
    hunt_pass_bindings: [{ id: 'bind-1', hunt_id: 'hunt-1', version_id: 'ver-1', event_id: 'ev-dinner', ticket_type_id: 'tier-pass', seller_space_id: 'space-1', benefit_codes: ['tasting'], revision: 1, status: 'active' }],
    event_tickets: [{
      id: TICKET, event_id: 'ev-dinner', ticket_type_id: 'tier-pass', buyer_profile_id: 'buyer-1', qty: 2, amount_cents: PASS_TOTAL,
      platform_fee_cents: 450, currency: 'usd', status: 'pending', refunded_at: null, stripe_checkout_session_id: 'cs_pass', stripe_payment_intent_id: null,
      hunt_pass: {
        v: 1,
        snapshot: { bindingId: 'bind-1', bindingRevision: 1, huntId: 'hunt-1', versionId: 'ver-1', sellerSpaceId: 'space-1', benefitCodes: ['tasting'] },
        eventId: 'ev-dinner', ticketTypeId: 'tier-pass', qty: 2, unitCents: 4_500, totalCents: PASS_TOTAL, chargedCents: PASS_TOTAL, currency: 'USD',
      },
    }],
    event_rsvps: [{ from_ticket_id: TICKET, profile_id: 'buyer-1' }],
    commerce_orders: [{ id: ORDER, status: 'pending', owner_space_id: 'space-1', buyer_profile_id: 'buyer-1', stripe_checkout_session_id: 'cs_order', stripe_payment_intent_id: null }],
    commerce_order_items: [{ id: LINE, order_id: ORDER, product_id: 'prod-tee', variant_id: null, qty: 2 }],
    hunt_store_offers: [{ id: 'offer-1', hunt_id: 'hunt-1', seller_space_id: 'space-1', product_id: 'prod-tee', variant_id: null, benefit_code: 'tee-pickup', requires_state: 'paid', status: 'approved' }],
    hunt_entitlements: [],
    hunt_entitlement_events: [],
    hunt_refund_cases: [],
    hunt_commerce_intents: [],
  })
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', '1')
})

describe('signature', () => {
  it('an event signed with the wrong secret is refused and changes nothing', async () => {
    const out = await deliver('checkout.session.completed', { id: 'cs_pass', payment_status: 'paid', payment_intent: 'pi_pass', metadata: { kind: 'ticket' } }, { secret: 'whsec_someone_else' })
    expect(out).toEqual({ status: 400, body: { error: 'invalid signature' } })
    expect(fake.tables.event_tickets[0].status).toBe('pending')
    expect(fake.tables.hunt_entitlements).toEqual([])
    expect(fake.tables.stripe_webhook_events).toEqual([])
  })
})

describe('paid', () => {
  it('a paid pass gives one benefit per seat: the buyer’s is active, the guest seat waits for its claim', async () => {
    expect((await ticketPaid()).status).toBe(200)
    expect(fake.tables.event_tickets[0].status).toBe('succeeded')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'active', 'seat-2': 'pending_claim' })
    expect(fake.tables.hunt_entitlements.every((e) => e.binding_id === 'bind-1' && e.benefit_code === 'tasting')).toBe(true)
  })

  it('a paid store order gives one benefit per unit of the bound line', async () => {
    expect((await orderPaid()).status).toBe(200)
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'active' })
  })

  it('an unpaid session, and any session while the switch is off, gives nothing', async () => {
    await deliver('checkout.session.completed', { id: 'cs_pass', payment_status: 'unpaid', payment_intent: 'pi_pass', metadata: { kind: 'ticket' } })
    expect(fake.tables.hunt_entitlements).toEqual([])
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    await ticketPaid()
    await orderPaid()
    expect(fake.tables.event_tickets[0].status).toBe('succeeded') // canonical settlement is untouched by the switch
    expect(fake.tables.hunt_entitlements).toEqual([])
  })

  it('a ticket that settled for an amount its snapshot does not name gives nothing and leaves a record', async () => {
    fake.tables.event_tickets[0].amount_cents = 100
    expect((await ticketPaid()).status).toBe(200) // settlement still acks: the buyer paid, the benefit is held
    expect(fake.tables.hunt_entitlements).toEqual([])
    expect(fake.tables.hunt_commerce_intents).toMatchObject([{ source_id: TICKET, binding_id: 'bind-1', status: 'pending', attempts: 1, last_error: 'ticket-projection: purchase snapshot refused: price_mismatch' }])
  })
})

describe('replay', () => {
  it('the same event delivered twice is acked as a duplicate and runs nothing twice', async () => {
    await ticketPaid('evt_same')
    const calls = fake.rpcCalls.length
    expect(await ticketPaid('evt_same')).toEqual({ status: 200, body: { received: true, duplicate: true } })
    expect(fake.rpcCalls).toHaveLength(calls)
  })

  it('the same payment under a new event id projects again and creates nothing new', async () => {
    await ticketPaid()
    await orderPaid()
    await ticketPaid()
    await orderPaid()
    expect(fake.tables.hunt_entitlements).toHaveLength(4)
    expect(fake.tables.hunt_entitlement_events.filter((e) => e.kind === 'projected')).toHaveLength(4)
  })
})

describe('refund', () => {
  it('a full refund revokes every unused benefit of that source, once, and leaves the other source alone', async () => {
    await ticketPaid()
    await orderPaid()
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    expect(fake.tables.event_tickets[0].status).toBe('refunded')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'active' })
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    expect(fake.tables.hunt_entitlement_events.filter((e) => e.kind === 'revoked')).toHaveLength(2)
    await refund('pi_order', ORDER_TOTAL, ORDER_TOTAL)
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'revoked', [`${LINE}:2`]: 'revoked' })
    expect(cases()).toEqual([])
  })

  it('a full refund of a consumed benefit keeps the service history and opens a case', async () => {
    await ticketPaid()
    fake.tables.hunt_entitlements.find((e) => e.unit_key === 'seat-1')!.state = 'consumed'
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'consumed', 'seat-2': 'revoked' })
    expect(cases()).toEqual([{ source: 'event-ticket', kind: 'consumed_reversal', amount: undefined }])
  })

  it('a partial refund revokes nothing and opens one review case that names the amount, never a seat', async () => {
    await ticketPaid()
    await orderPaid()
    await refund('pi_pass', PASS_TOTAL, 4_500)
    await refund('pi_pass', PASS_TOTAL, 4_500) // redelivered under a new event id
    await refund('pi_order', ORDER_TOTAL, 3_000)
    expect(fake.tables.event_tickets[0].status).toBe('succeeded')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'active', 'seat-2': 'pending_claim' })
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'active' })
    expect(cases()).toEqual([
      { source: 'event-ticket', kind: 'partial_unmapped', amount: 4_500 },
      { source: 'store-order', kind: 'partial_unmapped', amount: 3_000 },
    ])
  })

  it('a second partial refund that completes the refund revokes everything', async () => {
    await ticketPaid()
    await refund('pi_pass', PASS_TOTAL, 4_500)
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
  })
})

describe('dispute', () => {
  it('a lost dispute revokes the unused benefits of that source', async () => {
    await ticketPaid()
    await orderPaid()
    await disputeClosed('pi_pass', 'lost')
    await disputeClosed('pi_order', 'lost')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'revoked', [`${LINE}:2`]: 'revoked' })
    expect(fake.tables.commerce_orders[0].status).toBe('refunded')
  })

  it('a won dispute changes nothing while the purchase is still paid', async () => {
    await ticketPaid()
    await orderPaid()
    await disputeClosed('pi_pass', 'won')
    await disputeClosed('pi_order', 'won')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'active', 'seat-2': 'pending_claim' })
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'active', [`${LINE}:2`]: 'active' })
  })

  it('a dispute won after a refund does not bring a revoked benefit back', async () => {
    await ticketPaid()
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    await disputeClosed('pi_pass', 'won')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
  })
})

describe('out of order', () => {
  it('a paid delivery that arrives after the refund does not reopen a revoked benefit', async () => {
    await ticketPaid()
    await orderPaid()
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    await refund('pi_order', ORDER_TOTAL, ORDER_TOTAL)
    await ticketPaid()
    await orderPaid()
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
    expect(benefits(ORDER)).toEqual({ [`${LINE}:1`]: 'revoked', [`${LINE}:2`]: 'revoked' })
    expect(fake.tables.hunt_entitlements).toHaveLength(4)
  })

  it('a lost dispute that arrives before the refund event, then the refund, revokes once', async () => {
    await ticketPaid()
    await disputeClosed('pi_pass', 'lost')
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'revoked', 'seat-2': 'revoked' })
    expect(fake.tables.hunt_entitlement_events.filter((e) => e.kind === 'revoked')).toHaveLength(2)
  })

  // KNOWN LIMIT, recorded in docs/hunts/PILOT-COMMERCE.md. The canonical ticket refund only flips a ticket
  // that has already settled, so a refund event that is handled BEFORE the first paid delivery finds nothing
  // to refund, and the late paid delivery then settles the ticket and projects its benefits. The Hunt layer
  // follows canonical state exactly; the reconciliation check (provider refunded, ticket still paid) is what
  // catches it. This case pins that behaviour so a change to it is a decision, not an accident.
  it('KNOWN LIMIT: a refund handled before the ticket ever settled is not seen, so reconciliation must catch it', async () => {
    await refund('pi_pass', PASS_TOTAL, PASS_TOTAL)
    await ticketPaid()
    expect(fake.tables.event_tickets[0].status).toBe('succeeded')
    expect(benefits(TICKET)).toEqual({ 'seat-1': 'active', 'seat-2': 'pending_claim' })
  })
})
