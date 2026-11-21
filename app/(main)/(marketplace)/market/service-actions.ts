'use server'

import { getMyProfileId } from '@/lib/auth'
import { getProduct } from '@/lib/commerce/products'
import { getSpaceById } from '@/lib/spaces/store'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { BOOKING_CHECKOUT_SECONDS } from '@/lib/spaces/booking'
import { createBooking, holdSlotForBooking, linkBookingToOrder, releasePendingHold } from '@/lib/spaces/booking'
import { payoutsLive } from '@/lib/billing/connect'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBlockedBetween } from '@/lib/blocking'
import { rateLimitOk } from '@/lib/rate-limit'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import { isError } from '@/lib/action-result'
import { isBookableServiceKind } from '@/lib/commerce/types'
import type { ServiceConfig } from '@/lib/commerce/types'
import { notifyDirectMessage } from '@/lib/messages/dm-notify'

// Bookable-services checkout (Phase 4, ADR-596). Joins the two existing engines with no new charge
// machinery: HOLD-FIRST (a 'pending' booking) then the deposit rides the SAME commerce checkout, and the
// settle webhook (recordCommerceOrderFromSession → confirmBookingByOrder) flips the hold to confirmed.
// Branches on ServiceConfig.priceModel: 'contact' = enquiry only (the sanctioned no-checkout exception,
// ADR-596 §3/§7), 'free' = confirm with no payment, else pay-and-book. The paid path is gated behind
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
  // 'booking' is an alias of 'service' for the booking path (F11), so accept both kinds here.
  if (!product || !isBookableServiceKind(product.productKind) || product.status !== 'active') {
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
  // SCAN-715: a hold is a seat nobody else can take until the Checkout settles or expires. Five
  // starts an hour per buyer, and a 30-minute session, so one person cannot park every slot of a
  // Space for a day by opening and closing Checkout tabs.
  if (!(await rateLimitOk('service_book', buyerProfileId, 5, '1 h'))) {
    return { error: 'You have started a lot of bookings. Try again in a little while.' }
  }
  // BOOK-006: the hold follows the same slot rules as a free booking (service length, buffers, notice,
  // days off, calendar blocks, booking window) and keeps the buyer's note.
  const hold = await holdSlotForBooking(product.bookingSpaceId, buyerProfileId, startsAtISO, product.id, {
    note: note ?? null,
  })
  if ('error' in hold) return { error: hold.error }

  // A missing url OR a missing orderId is a failure: without the order the settle webhook can never
  // confirm the hold and a refund can never release it (both key on order_id), so keeping the hold + the
  // payment coupled means we must release the hold and stop rather than send the buyer to pay. The
  // release is the pending-hold flip (BOOK-006): it frees the slot without the member cancel rules.
  try {
    const checkout = await createCommerceCheckout({
      buyerProfileId,
      items: [{ productId: product.id, qty: 1 }],
      expiresInSeconds: BOOKING_CHECKOUT_SECONDS,
    })
    if (checkout.error || !checkout.url || !checkout.orderId) {
      await releasePendingHold(hold.bookingId)
      return { error: checkout.error ?? 'Could not start checkout.' }
    }
    await linkBookingToOrder(hold.bookingId, checkout.orderId)
    return { url: checkout.url }
  } catch {
    await releasePendingHold(hold.bookingId)
    return { error: 'Could not start checkout.' }
  }
}

export interface ServiceEnquiryResult {
  /** The thread the enquiry landed in. An ID, not a URL (ADR-896): the caller opens the chat
   *  dock over the listing rather than navigating the buyer away to a DM page. */
  conversationId?: string
  error?: string
}

// Contact-only services have no online checkout (ADR-596 §3/§7) — the buyer enquires instead.
// This opens (or reuses) a 1:1 message thread with the Space owner and seeds the enquiry. It is the
// ONE sanctioned path that bypasses startConversation's friendship gate (a business enquiry is
// exactly the case friendship can't cover), so a per-buyer rate limit — not friendship — is what
// keeps it from being an open DM spigot.
export async function sendServiceEnquiry(productId: string): Promise<ServiceEnquiryResult> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to send an enquiry.' }

  const product = await getProduct(productId)
  if (!product || !isBookableServiceKind(product.productKind) || product.status !== 'active') {
    return { error: 'This service is not available.' }
  }
  const svc = ((product.metadata as Record<string, unknown>)?.service ?? {}) as ServiceConfig
  if (svc.priceModel !== 'contact') return { error: 'This service takes bookings, not enquiries.' }

  // Resolve the owner to message: a maker owns its own listing; a Space listing routes to the
  // Space owner's profile.
  let ownerProfileId = product.ownerProfileId
  if (!ownerProfileId && product.ownerSpaceId) {
    const space = await getSpaceById(product.ownerSpaceId)
    ownerProfileId = space?.ownerProfileId ?? null
  }
  if (!ownerProfileId) return { error: 'This space is not reachable right now.' }
  if (ownerProfileId === buyerProfileId) return { error: 'This is your own listing.' }

  // Block gate (parity with startConversation / sendMessage).
  if (await isBlockedBetween(buyerProfileId, ownerProfileId)) {
    return { error: 'You cannot message this space.' }
  }

  // Spam guard: cap enquiries per buyer since this bypasses the friendship gate.
  if (!(await rateLimitOk('service_enquiry', buyerProfileId, 5, '1 h'))) {
    return { error: 'You have sent a lot of enquiries. Try again in a little while.' }
  }

  const admin = createAdminClient()
  const conversationId = await findOrCreateDirectConversation(admin, buyerProfileId, ownerProfileId)
  const enquiry = `Hi! I am interested in your service "${product.title}". Is it available?`
  const { error } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: buyerProfileId,
    body: enquiry,
  })
  if (error) return { error: 'Could not send your enquiry. Try again.' }
  await notifyDirectMessage(admin, { conversationId, senderId: buyerProfileId, recipientId: ownerProfileId, body: enquiry })

  return { conversationId }
}
