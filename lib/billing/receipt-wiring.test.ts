import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// THE OTHER HALF OF LIVE-344: not "does the message read right" (that is each receipt module's own
// test) but "is it sent EXACTLY ONCE". Stripe redelivers. A webhook that emails on every delivery is
// worse than one that never emails, because a duplicate receipt for real money is not recallable.
//
// Nothing in the receipt modules dedupes, deliberately: each CALLER sends only for work IT did, and
// this file pins that contract on every lane at once, by running each settle TWICE the way a
// redelivery runs it. The second run finds nothing to do, exactly as it does in production:
//   • the one-off lanes (tip, supporter, donation) flip `pending` -> `succeeded` and `.select()`
//     returns zero rows the second time;
//   • the Space membership lane INSERTS the membership, and the second insert returns 23505;
//   • the Space plan lane reads the plan BEFORE it writes, so the second run reads paid -> paid;
//   • the member invoice lane sends only when the ledger reported `recorded: true`, which is
//     exactly-once on the invoice id.

type Result = { data?: unknown; error?: unknown }

const state = vi.hoisted(() => {
  const queues = new Map<string, Result[]>()
  return {
    queues,
    push(table: string, ...results: Result[]) {
      const q = queues.get(table) ?? []
      q.push(...results)
      queues.set(table, q)
    },
    take(table: string): Result {
      const q = queues.get(table)
      const next = q?.shift()
      return next ?? { data: null, error: null }
    },
    reset() {
      queues.clear()
    },
  }
})

vi.mock('@/lib/supabase/admin', () => {
  const build = (table: string) => {
    // Every builder method returns the same thenable, so a chain of any shape resolves to the next
    // scripted result for its table. That keeps the fake honest about ORDER (which is what these
    // tests are about) without modelling PostgREST.
    const b: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single', 'update', 'insert', 'upsert', 'delete']) {
      b[k] = () => b
    }
    b.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(state.take(table)).then(res, rej)
    return b
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => build(table),
      rpc: async () => ({ data: null, error: null }),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'x@example.test' } } }) } },
    }),
  }
})

// The receipt modules themselves are spies here: what they SAY is pinned by their own tests; what
// this file measures is how many times a settle reaches them.
const receipts = vi.hoisted(() => ({
  donation: vi.fn(async () => {}),
  supporter: vi.fn(async () => {}),
  tipper: vi.fn(async () => {}),
  membership: vi.fn(async () => {}),
  plan: vi.fn(async () => {}),
  invoice: vi.fn(async () => {}),
}))
vi.mock('./donation-receipt', () => ({ sendDonationReceipts: receipts.donation, DONATION_RECEIVED_NOTIFICATION_TYPE: 'x' }))
vi.mock('./supporter-receipt', () => ({ sendSupporterContributionReceipt: receipts.supporter }))
vi.mock('./tip-receipt', () => ({ sendTipperReceipt: receipts.tipper }))
vi.mock('./subscription-receipt', () => ({
  sendSpaceMembershipReceipts: receipts.membership,
  sendSpacePlanReceipt: receipts.plan,
  sendMembershipInvoiceReceipt: receipts.invoice,
  SPACE_MEMBER_PAID_NOTIFICATION_TYPE: 'x',
}))

const ledger = vi.hoisted(() => ({ recorded: true, fn: vi.fn(async () => ({ recorded: true })) }))
vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction: (...args: unknown[]) => ledger.fn(...(args as [])),
  ENTITY_ID: { foundation: 'f', labs: 'l' },
}))

vi.mock('./tips-notify', () => ({ notifyTipRecipient: vi.fn(async () => {}) }))
vi.mock('./stripe', () => ({ stripe: null, appUrl: () => 'https://freq.test' }))
vi.mock('./connect', () => ({ getConnectStatus: async () => ({ accountId: null, ready: false }), payoutsLive: async () => false }))
vi.mock('./receipt-address', () => ({ receiptEmailFor: async () => undefined }))

// The Space plan reconcile's neighbours: none of them is what this file measures.
vi.mock('@/lib/pricing/space-plan', () => ({ setSpaceAddons: vi.fn(async () => {}), setSpacePlan: vi.fn(async () => {}) }))
vi.mock('./space-subscription-items', () => ({
  reconciledItemsFromSubscription: () => [],
  planForItemKeys: () => 'business',
  addonsForItemKeys: () => [],
  persistSpaceSubscriptionItems: vi.fn(async () => {}),
  seatQuantityFromItems: () => 0,
}))
vi.mock('./beta-founding', () => ({ grantBetaFounding: vi.fn(async () => {}) }))
vi.mock('./founding-payment', () => ({ foundingPaymentSignal: () => ({ earnsFounding: false, monthlyRateCents: 0 }) }))
vi.mock('@/lib/founding/status', () => ({ lapseFoundingStatus: vi.fn(async () => {}) }))
vi.mock('@/lib/spaces/seats', () => ({ setSpaceSeatQuantity: vi.fn(async () => {}) }))
vi.mock('@/lib/spaces/tier-circle', () => ({ syncTierCircleAccess: vi.fn(async () => {}) }))

import { recordSpaceDonationFromSession } from './space-donation-checkout'
import { recordSupporterContributionFromSession } from './supporter'
import { recordTipFromSession } from './tips'
import { reconcileSpaceMembershipSubscription, reconcileSpacePlanSubscription } from './space-subscriptions'
import { recordMembershipDuesFromInvoice } from './checkout'

function paidSession(kind: string): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    metadata: { kind },
    customer_details: { email: 'buyer@example.test' },
  } as unknown as Stripe.Checkout.Session
}

beforeEach(() => {
  vi.clearAllMocks()
  state.reset()
  ledger.fn.mockImplementation(async () => ({ recorded: true }))
})

describe('the one-off lanes send once per settled row, never on a redelivery', () => {
  it('a gift: one receipt on the flip, none on the redelivery', async () => {
    state.push(
      'space_donations',
      { data: [{ id: 'g-1', space_id: 's-1', ask_id: 'a-1', platform_fee_cents: 0, amount_cents: 2000, donor_profile_id: 'd-1', currency: 'usd', message: null }], error: null },
      { data: [], error: null }, // the redelivery flips nothing
    )
    await recordSpaceDonationFromSession(paidSession('space_donation'))
    await recordSpaceDonationFromSession(paidSession('space_donation'))
    expect(receipts.donation).toHaveBeenCalledTimes(1)
    expect(receipts.donation.mock.calls[0][0]).toMatchObject({ id: 'g-1', spaceId: 's-1', donorEmail: 'buyer@example.test' })
  })

  it('a contribution: one receipt on the flip, none on the redelivery', async () => {
    state.push(
      'supporter_contributions',
      { data: [{ id: 'c-1', amount_cents: 2500, profile_id: 'p-1', currency: 'usd' }], error: null },
      { data: [], error: null },
    )
    state.push('profiles', { data: null, error: null }, { data: null, error: null })
    await recordSupporterContributionFromSession(paidSession('supporter_contribution'))
    await recordSupporterContributionFromSession(paidSession('supporter_contribution'))
    expect(receipts.supporter).toHaveBeenCalledTimes(1)
    expect(receipts.supporter.mock.calls[0][0]).toMatchObject({ id: 'c-1', profileId: 'p-1', amountCents: 2500 })
  })

  it('a tip: one tipper receipt on the flip, none on the redelivery', async () => {
    state.push(
      'tips',
      { data: [{ id: 't-1', platform_fee_cents: 0, from_profile_id: 'f-1', currency: 'usd', to_profile_id: 'h-1', amount_cents: 500, message: null }], error: null },
      { data: [], error: null },
    )
    await recordTipFromSession(paidSession('tip'))
    await recordTipFromSession(paidSession('tip'))
    expect(receipts.tipper).toHaveBeenCalledTimes(1)
    expect(receipts.tipper.mock.calls[0][0]).toMatchObject({ id: 't-1', from_profile_id: 'f-1' })
  })

  it('an unpaid session records nothing and sends nothing', async () => {
    const unpaid = { ...paidSession('tip'), payment_status: 'unpaid' } as unknown as Stripe.Checkout.Session
    await recordTipFromSession(unpaid)
    expect(receipts.tipper).not.toHaveBeenCalled()
  })
})

describe('the Space membership lane sends only on the first payment', () => {
  const sub = (status: string) =>
    ({
      id: 'sub_1',
      status,
      metadata: { kind: 'space_membership', space_id: 's-1', member_id: 'm-1', tier_id: 'tier-1' },
      items: { data: [] },
    }) as unknown as Stripe.Subscription

  it('the INSERT receipts; the losing insert of the same checkout (23505) does not', async () => {
    state.push(
      'space_memberships',
      { data: [], error: null }, // no active membership yet
      { data: null, error: null }, // the insert lands
      { data: [], error: null }, // second delivery: still no active row read back
      { data: null, error: { code: '23505', message: 'duplicate' } }, // and its insert loses the race
    )
    await reconcileSpaceMembershipSubscription(sub('active'))
    await reconcileSpaceMembershipSubscription(sub('active'))
    expect(receipts.membership).toHaveBeenCalledTimes(1)
    expect(receipts.membership.mock.calls[0][0]).toMatchObject({ spaceId: 's-1', memberProfileId: 'm-1', tierId: 'tier-1' })
  })

  it('an UPDATE to an existing membership is a tier switch or a card recovery, not a new member', async () => {
    state.push(
      'space_memberships',
      { data: [{ id: 'mem-1', tier_id: 'tier-1' }], error: null },
      { data: null, error: null },
    )
    await reconcileSpaceMembershipSubscription(sub('past_due'))
    expect(receipts.membership).not.toHaveBeenCalled()
  })

  it('a first event that is not yet an active payment receipts nobody', async () => {
    state.push('space_memberships', { data: [], error: null })
    await reconcileSpaceMembershipSubscription(sub('incomplete'))
    expect(receipts.membership).not.toHaveBeenCalled()
  })
})

describe('the Space plan lane sends only on the free to paid transition', () => {
  const sub = {
    id: 'sub_2',
    status: 'active',
    created: 1,
    customer: 'cus_1',
    metadata: { kind: 'space_plan', space_id: 's-1', plan: 'business' },
    items: { data: [] },
  } as unknown as Stripe.Subscription

  it('receipts the operator once, and not on the redelivery that reads paid to paid', async () => {
    // First delivery: prior plan free, then the subscription-id read, then the write.
    state.push('spaces', { data: { plan: 'free' }, error: null }, { data: { stripe_subscription_id: null }, error: null }, { error: null })
    await reconcileSpacePlanSubscription(sub)
    expect(receipts.plan).toHaveBeenCalledTimes(1)
    expect(receipts.plan.mock.calls[0][0]).toMatchObject({ spaceId: 's-1', plan: 'business' })

    // Redelivery: the plan this reconcile already wrote is what it now reads.
    state.push('spaces', { data: { plan: 'business' }, error: null }, { data: { stripe_subscription_id: 'sub_2' }, error: null }, { error: null })
    await reconcileSpacePlanSubscription(sub)
    expect(receipts.plan).toHaveBeenCalledTimes(1)
  })

  it('an unreadable prior plan sends NOTHING and says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.push('spaces', { data: null, error: { message: 'boom' } }, { data: { stripe_subscription_id: null }, error: null }, { error: null })
    await reconcileSpacePlanSubscription(sub)
    expect(receipts.plan).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a cancelled subscription reverts the Space and receipts nobody', async () => {
    state.push('spaces', { data: { plan: 'business' }, error: null }, { data: { stripe_subscription_id: 'sub_2' }, error: null }, { error: null })
    await reconcileSpacePlanSubscription({ ...sub, status: 'canceled' } as unknown as Stripe.Subscription)
    expect(receipts.plan).not.toHaveBeenCalled()
  })
})

describe('the member invoice lane rides the ledger idempotency', () => {
  const invoice = (id: string) =>
    ({
      id,
      amount_paid: 800,
      currency: 'usd',
      customer: 'cus_1',
      parent: { subscription_details: { metadata: { profile_id: 'p-1', tier: 'crew' } } },
    }) as unknown as Stripe.Invoice

  it('sends when the ledger booked the invoice, and not when it was already booked', async () => {
    await recordMembershipDuesFromInvoice(invoice('in_1'))
    expect(receipts.invoice).toHaveBeenCalledTimes(1)
    expect(receipts.invoice.mock.calls[0][0]).toMatchObject({ profileId: 'p-1', amountCents: 800, tier: 'crew' })

    ledger.fn.mockImplementationOnce(async () => ({ recorded: false }))
    await recordMembershipDuesFromInvoice(invoice('in_1'))
    expect(receipts.invoice).toHaveBeenCalledTimes(1)
  })

  it('a Space subscription invoice is not member dues and receipts nobody here', async () => {
    const spaceInvoice = {
      id: 'in_2',
      amount_paid: 2900,
      currency: 'usd',
      parent: { subscription_details: { metadata: { kind: 'space_plan', space_id: 's-1' } } },
    } as unknown as Stripe.Invoice
    await recordMembershipDuesFromInvoice(spaceInvoice)
    expect(receipts.invoice).not.toHaveBeenCalled()
    expect(ledger.fn).not.toHaveBeenCalled()
  })

  it('a zero invoice books nothing and sends nothing', async () => {
    await recordMembershipDuesFromInvoice({ ...invoice('in_3'), amount_paid: 0 } as unknown as Stripe.Invoice)
    expect(receipts.invoice).not.toHaveBeenCalled()
  })
})
