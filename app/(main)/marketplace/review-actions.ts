'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getProduct } from '@/lib/commerce/products'
import { upsertProductReview, hasPurchasedProduct } from '@/lib/commerce/reviews'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Trust & Safety (Phase 8): a member reviews a commerce product (a Market listing or a Space Shop
// item). Gated: signed-in member, attributed to THEM (unforgeable), and NOT the seller (no seeding
// your own proof). verified_purchase is DERIVED from a settled order, never client-supplied.
//
// Payments are OFF today, so no order ever settles and every review lands verified_purchase=false.
// TODO(payments-on): once host_payouts_enabled is live, GATE this on hasPurchasedProduct (a real
// buyer/booking) instead of allowing any signed-in member.

export async function submitProductReviewAction(
  productId: string,
  input: { rating: number; body: string },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to leave a review.')

  const product = await getProduct(productId)
  if (!product) return fail('That listing is not available.')

  // The seller cannot review their own listing (the deliverable: a buyer, not the seller).
  if (product.ownerProfileId && product.ownerProfileId === profileId) {
    return fail('You cannot review your own listing.')
  }

  const rating = Math.trunc(input.rating)
  if (!(rating >= 1 && rating <= 5)) return fail('Pick a rating from 1 to 5.')

  const verifiedPurchase = await hasPurchasedProduct(profileId, productId)
  const saved = await upsertProductReview({
    productId,
    reviewerProfileId: profileId,
    rating,
    body: input.body ?? '',
    verifiedPurchase,
  })
  if (!saved) return fail('Could not save your review. Try again.')

  revalidatePath(`/market/${productId}`)
  return ok()
}
