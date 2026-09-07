import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — the two `profiles.stripe_customer_id` reads in lib/billing/checkout.ts.
//
// A PostgREST failure arrives in `error`, not as a throw, so both reads used to be indistinguishable
// from "this member has no Stripe customer yet":
//
//   createMembershipCheckout — the session was minted with NO customer, so Stripe created a BRAND NEW
//     one for a member who already had one. That is a permanent split identity (subscriptions,
//     invoices, payment methods and the portal land on two customers, and nothing after the fact can
//     say which is theirs). DIRECTION: FAIL CLOSED — return null, the function's existing default-deny.
//   createBillingPortal — there is no other direction available (no customer id, no portal), so the
//     change is that the failure is no longer SILENT: it is logged, because a paying member told they
//     have no billing to manage (and so unable to cancel) otherwise leaves no trace anywhere.

type Result = { data: unknown; error: { message: string } | null }

const state = vi.hoisted(() => {
  let result: Result = { data: null, error: null }
  return {
    get result() {
      return result
    },
    set(r: Result) {
      result = r
    },
  }
})

const stripeFake = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
}))

vi.mock('./stripe', () => ({ stripe: stripeFake, appUrl: () => 'https://app.test' }))
vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction: vi.fn(async () => {}),
  ENTITY_ID: { foundation: 'ent-foundation' },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(state.result),
    }
    return b
  },
}))

import { createMembershipCheckout, createBillingPortal } from './checkout'

const OPTS = { profileId: 'm1', email: 'm@example.test', tier: 'crew' as const, amountCents: 1200 }

beforeEach(() => {
  state.set({ data: null, error: null })
  stripeFake.checkout.sessions.create.mockReset()
  stripeFake.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.test/cs_1' })
  stripeFake.billingPortal.sessions.create.mockReset()
  stripeFake.billingPortal.sessions.create.mockResolvedValue({ url: 'https://stripe.test/portal' })
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('createMembershipCheckout — an unreadable stripe_customer_id (SCAN-539)', () => {
  it('refuses rather than minting a DUPLICATE Stripe customer', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })

    const url = await createMembershipCheckout(OPTS)

    // Old behaviour: the unchecked read looked like "no customer yet", a session was created with
    // customer_email only, and Stripe minted a second customer for an existing subscriber.
    expect(url).toBeNull()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('reuses the saved customer on a clean read', async () => {
    state.set({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    const url = await createMembershipCheckout(OPTS)
    expect(url).toBe('https://stripe.test/cs_1')
    const args = stripeFake.checkout.sessions.create.mock.calls[0][0] as Record<string, unknown>
    expect(args.customer).toBe('cus_existing')
  })

  it('still opens a first-time checkout on email when the member genuinely has no customer', async () => {
    state.set({ data: null, error: null })
    const url = await createMembershipCheckout(OPTS)
    expect(url).toBe('https://stripe.test/cs_1')
    const args = stripeFake.checkout.sessions.create.mock.calls[0][0] as Record<string, unknown>
    expect(args.customer).toBeUndefined()
    expect(args.customer_email).toBe('m@example.test')
  })
})

describe('createBillingPortal — an unreadable stripe_customer_id (SCAN-539)', () => {
  it('still returns null (no id, no portal) but no longer fails silently', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })

    const url = await createBillingPortal('m1')

    expect(url).toBeNull()
    expect(stripeFake.billingPortal.sessions.create).not.toHaveBeenCalled()
    // The distinguishing bit: a read failure is logged, so "you have no billing to manage" shown to a
    // paying member leaves a trace instead of looking like a member with no subscription.
    expect(console.error).toHaveBeenCalled()
  })

  it('does NOT log when the member genuinely has no customer (that is not a failure)', async () => {
    state.set({ data: null, error: null })
    const url = await createBillingPortal('m1')
    expect(url).toBeNull()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('opens the portal on a clean read', async () => {
    state.set({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    expect(await createBillingPortal('m1')).toBe('https://stripe.test/portal')
  })
})
