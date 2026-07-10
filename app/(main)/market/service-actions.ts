'use server'

import { getMyProfileId } from '@/lib/auth'
import { getProduct } from '@/lib/commerce/products'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { createBooking, holdSlotForBooking, linkBookingToOrder, cancelBooking } from '@/lib/spaces/booking'
import { payoutsLive } from '@/lib/billing/connect'
import { isError } from '@/lib/action-result'
import type { ServiceConfig } from '@/lib/commerce/types'

// Bookable-services checkout (Phase 4, ADR-593). Joins the two existing engines with no new charge
// machinery: HOLD-FIRST (a 'pending' booking) then the deposit rides the SAME commerce checkout, and the
// settle webhook (recordCommerceOrderFromSession → confirmBookingByOrder) flips the hold to confirmed.
// Branches on ServiceConfig.priceModel: 'contact' = enquiry only (the sanctioned no-checkout exception,
// ADR-593 §3/§7), 'free' = confirm with no payment, else pay-and-book. The paid path is gated behind
// payoutsLive(), so it (and the 'pending'/order_id columns from migration 20261102000000) stay dormant
// until payments are turned on. NOTE: v1 charges the full price; partial-deposit charging (depositCents)
// is a documented follow-on (the field is stored + displayed but not yet the charged amount).

export interface BookServiceResult {
  url?: string
  error?: string
  /** True for a contact-only service: the caller should reach out, not check out. */
  enquiry?: boolean
}

export async function bookServiceAction(
  productId: string,
  startsAtISO: string,
  note?: string,
): Promise<BookServiceResult> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to book.' }

  const product = await getProduct(productId)
  if (!product || product.productKind !== 'service' || product.status !== 'active') {
    return { error: 'This service is not available.' }
  }
  const svc = ((product.metadata as Record<string, unknown>)?.service ?? {}) as ServiceConfig
  // Contact-only services are an enquiry, never an online checkout.
  if (svc.priceModel === 'contact') return { enquiry: true }
  if (!product.bookingSpaceId) return { error: 'This service is not set up for booking yet.' }

  // Free service: confirm the booking directly, no payment (works with payments off).
  if (svc.priceModel === 'free' || product.priceCents === 0) {
    const res = await createBooking(product.bookingSpaceId, startsAtISO, note)
    if (isError(res)) return { error: res.error }
    return { url: '/orders?booked=1' }
  }

  // Paid service: gate behind payments, HOLD-FIRST, then take payment and link the hold to the order.
  if (!(await payoutsLive())) return { error: 'Payments aren’t turned on yet.' }
  const hold = await holdSlotForBooking(product.bookingSpaceId, buyerProfileId, startsAtISO, product.id)
  if (!hold) return { error: 'That time is no longer available. Pick another.' }

  const checkout = await createCommerceCheckout({ buyerProfileId, items: [{ productId: product.id, qty: 1 }] })
  // A missing url OR a missing orderId is a failure: without the order the settle webhook can never
  // confirm the hold and a refund can never release it (both key on order_id), so keeping the hold + the
  // payment coupled means we must release the hold and stop rather than send the buyer to pay.
  if (checkout.error || !checkout.url || !checkout.orderId) {
    await cancelBooking(hold.bookingId)
    return { error: checkout.error ?? 'Could not start checkout.' }
  }
  await linkBookingToOrder(hold.bookingId, checkout.orderId)
  return { url: checkout.url }
}
