import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// STRIPE'S OWN RECEIPT, AS A BACKSTOP (lib/billing/receipt-address.ts, LIVE-344). Before this,
// `receipt_email` was set NOWHERE in the codebase, so on every non-ticket money path Stripe had no
// address it was told to receipt either. Two halves:
//   1. the resolver itself, which must be shaped for a Stripe param and must never throw;
//   2. a SOURCE-SHAPE guard over all eight non-ticket checkout creators, because the consequence
//      ("a payer is reachable") cannot be observed from a unit test of any one of them, and a
//      creator that quietly stops resolving an address leaves no other trace.
//
// 🔴 WHY THE TWO MODES ARE CHECKED DIFFERENTLY, AND WHY THAT IS NOT A LOOPHOLE. `receipt_email` is a
// PAYMENT-INTENT parameter. Stripe accepts it on a Checkout Session only under `payment_intent_data`,
// and rejects `payment_intent_data` outright in `mode: 'subscription'`. So a subscription cannot
// carry one at any price, and its equivalent is the CUSTOMER's address, which is where Stripe sends
// every invoice receipt. The guard below holds each creator to the strongest thing its mode allows,
// which is the honest test; holding a subscription to `receipt_email` would only be satisfiable by
// writing a parameter the API would refuse.

const m = vi.hoisted(() => ({ accountEmail: null as string | null, threw: false }))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async () => {
    if (m.threw) throw new Error('lookup exploded')
    return m.accountEmail
  },
}))

import { receiptEmailFor } from './receipt-address'

beforeEach(() => {
  m.accountEmail = 'payer@example.test'
  m.threw = false
})

describe('receiptEmailFor', () => {
  it('returns the address, shaped for a Stripe param', async () => {
    await expect(receiptEmailFor('p-1')).resolves.toBe('payer@example.test')
  })

  it('returns undefined (not null) when there is no address, so it can be spread away', async () => {
    m.accountEmail = null
    await expect(receiptEmailFor('p-1')).resolves.toBeUndefined()
  })

  it('returns undefined for a payer with no account at all', async () => {
    await expect(receiptEmailFor(null)).resolves.toBeUndefined()
    await expect(receiptEmailFor(undefined)).resolves.toBeUndefined()
  })
})

// ── The source-shape guard ─────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')

/** Read a source file with its comments stripped, so a COMMENT about receipts can never satisfy a
 *  check about receipts (the shape-not-truth failure named in AGENTS.md). */
function code(rel: string): string {
  const raw = readFileSync(join(ROOT, rel), 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** The NON-TICKET Checkout Session creators. Event tickets are excluded because they are the one
 *  loop that already had a first-party receipt (lib/events/member-ticket-email.ts and its guest
 *  sibling) and are owned elsewhere.
 *
 *  It was eight; it is SEVEN. app/(main)/upgrade/actions.ts was the Supporter contribution, retired
 *  whole by LIVE-361 -- it had no caller anywhere, and Supporter is a PWYW badge on Crew rather than
 *  a second purchase. That file creates no Checkout Session at all now, so requiring it to resolve a
 *  payer address would be asserting against a creator that does not exist. */
const PAYMENT_MODE_CREATORS = [
  'lib/commerce/checkout.ts',
  'lib/billing/space-donation-checkout.ts',
  'lib/billing/tips.ts',
]
const SUBSCRIPTION_MODE_CREATORS = [
  'lib/billing/checkout.ts',
  'lib/billing/bundle-checkout.ts',
  'lib/billing/space-plan-checkout.ts',
  'lib/billing/space-membership-checkout.ts',
]

describe('every non-ticket checkout creator resolves an address for the payer', () => {
  it('there are seven of them, and no ticket creator is on the list', () => {
    const all = [...PAYMENT_MODE_CREATORS, ...SUBSCRIPTION_MODE_CREATORS]
    // SEVEN since LIVE-361 retired the Supporter contribution creator whole.
    expect(all).toHaveLength(7)
    expect(new Set(all).size).toBe(7)
    expect(all.some((f) => f.includes('tickets'))).toBe(false)
  })

  it.each(PAYMENT_MODE_CREATORS)('%s sets payment_intent_data.receipt_email', (file) => {
    const src = code(file)
    expect(src).toContain('receiptEmailFor')
    expect(src).toContain('receipt_email')
    expect(src).toContain('payment_intent_data')
  })

  it.each(SUBSCRIPTION_MODE_CREATORS)('%s puts an address on the customer', (file) => {
    const src = code(file)
    expect(src).toContain('receiptEmailFor')
    expect(src).toContain('customer_email')
    // A subscription session cannot carry payment_intent_data at all, so it must not pretend to.
    expect(src).not.toContain('receipt_email')
  })

  it('a comment alone cannot satisfy the guard', () => {
    expect(code('lib/billing/receipt-address.ts')).not.toContain('READ THIS BEFORE')
  })
})
