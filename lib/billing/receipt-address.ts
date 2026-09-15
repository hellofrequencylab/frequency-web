// STRIPE'S OWN RECEIPT, AS A BACKSTOP (LIVE-344). One resolver, used by every non-ticket checkout
// creator, so no money path can be opened without an address on it.
//
// 🔴 READ THIS BEFORE "FIXING" THE SUBSCRIPTION CREATORS. `receipt_email` is a PAYMENT-INTENT
// parameter. A Checkout Session accepts it only under `payment_intent_data`, which Stripe rejects
// outright in `mode: 'subscription'`. So the backstop takes the only two shapes the API has:
//
//   • mode 'payment'      -> `payment_intent_data.receipt_email`. Stripe emails its receipt for
//                            that charge regardless of the dashboard email settings.
//   • mode 'subscription' -> the CUSTOMER's address, which is what Stripe addresses every invoice
//                            receipt to. A session reusing a saved `customer` already has one; a
//                            session minting a new customer needs `customer_email`, and
//                            lib/billing/space-membership-checkout.ts was setting neither, so a
//                            member who started paying monthly was unreachable by Stripe as well as
//                            by us.
//
// Both are a BACKSTOP, never the plan. The first-party receipts (lib/billing/receipt-email.ts and
// its callers) are what a payer is meant to read; this is what still reaches them when a first-party
// receipt cannot be composed, and what covers a payer we have no profile for at all.

import 'server-only'

import { profileAccountEmail } from '@/lib/profiles/account-email'

/**
 * The proven account address for a payer, shaped for a Stripe param (`undefined`, not `null`, so it
 * can be spread straight into a create call and omitted when unknown).
 *
 * Best-effort by construction: `profileAccountEmail` swallows its own read failures and returns
 * null, and a checkout must never be refused because a backstop address could not be looked up.
 */
export async function receiptEmailFor(profileId: string | null | undefined): Promise<string | undefined> {
  if (!profileId) return undefined
  return (await profileAccountEmail(profileId)) ?? undefined
}
