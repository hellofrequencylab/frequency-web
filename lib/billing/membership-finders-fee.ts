// THE FINDER'S FEE ON A MEMBERSHIP IS CHARGED ONCE (ADR-1978, owner ruling 2026-11-18).
//
// A Space membership is a Stripe subscription, and a subscription can only carry its fee as a
// percent that Stripe then takes from EVERY invoice. So a member Frequency introduced used to cost
// the Space the network rate on every renewal, forever. The ruling is one finder's fee, on the first
// payment only. The checkout marks a subscription that carries one (`finders_fee: '1'` in its
// metadata), and when its FIRST invoice is paid this drops the percent to the card fee alone (or to
// nothing while the card fee pass-through is off, ./card-fee.ts), so every renewal is the Space's own.
//
// Idempotent: the live subscription's mark is read before the update and cleared by it, so a
// redelivered `invoice.paid` finds nothing to do.

import type Stripe from 'stripe'
import { stripe } from './stripe'
import { cardFeePassesThrough, sellerFeesNow } from './card-fee'
import { applicationFeePercent } from './processing-fee'

/** The metadata key the checkout sets on a subscription that carries a finder's fee. */
export const FINDERS_FEE_MARK = 'finders_fee'

/** The percent a membership's renewals carry once the finder's fee is spent: the card fee alone while
 *  the pass-through is on, else nothing. PURE apart from the pass-through date. */
export function renewalFeePercent(amountCents: number): number {
  if (!cardFeePassesThrough()) return 0
  return applicationFeePercent(amountCents, sellerFeesNow(amountCents, 0))
}

/** Is this the first invoice of a Space membership whose checkout marked a finder's fee? PURE. */
export function isFirstFindersFeeInvoice(invoice: Pick<Stripe.Invoice, 'billing_reason' | 'parent'>): boolean {
  const details = invoice.parent?.subscription_details
  return (
    invoice.billing_reason === 'subscription_create' &&
    details?.metadata?.kind === 'space_membership' &&
    details?.metadata?.[FINDERS_FEE_MARK] === '1'
  )
}

/** After a membership's first invoice is paid, stop the finder's fee recurring. A failure THROWS, so
 *  the webhook answers non-2xx and Stripe redelivers: leaving the percent in place would charge the
 *  Space the finder's fee again on the next renewal, which is the one outcome that must not be silent. */
export async function endMembershipFindersFee(invoice: Stripe.Invoice): Promise<{ ended: boolean }> {
  if (!isFirstFindersFeeInvoice(invoice)) return { ended: false }
  const ref = invoice.parent?.subscription_details?.subscription
  const subId = typeof ref === 'string' ? ref : ref?.id
  if (!subId || !stripe) return { ended: false }

  const sub = await stripe.subscriptions.retrieve(subId)
  if (sub.metadata?.[FINDERS_FEE_MARK] !== '1') return { ended: false } // already ended (a redelivery)
  const amount = sub.items.data.reduce((sum, item) => sum + (item.price.unit_amount ?? 0) * (item.quantity ?? 1), 0)
  await stripe.subscriptions.update(subId, {
    application_fee_percent: renewalFeePercent(amount),
    metadata: { ...sub.metadata, [FINDERS_FEE_MARK]: 'charged' },
  })
  return { ended: true }
}
