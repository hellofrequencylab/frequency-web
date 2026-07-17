// Product / listing-level reviews (ADR-598, Phase 8). A member leaves ONE 1-5 star rating +
// optional note on a commerce_products row (a Market listing or a Space Shop item); the
// aggregate shows on the product card + detail. Mirrors the Space reviews shape
// (lib/spaces/content-data.ts + content-actions.ts) — smallint rating, body, status
// moderation, one-per-author upsert. Server-only (admin client behind app-code authz).
//
// types: regenerated after the 20261112000000_commerce_reviews migration applies. Until then
// db() is annotated as the untyped SupabaseClient so `.from('commerce_reviews')` type-checks
// (same idiom as lib/commerce/reports.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

// The average is computed over the most recent REVIEWS_CAP rows (matches space_reviews). An
// early-stage listing never comes close, so this stays exact in practice.
const REVIEWS_CAP = 50

export interface ProductReviewItem {
  id: string
  rating: number
  body: string
  verifiedPurchase: boolean
  createdAt: string
  author: { displayName: string; avatarUrl: string | null } | null
}

export interface ProductReviewsData {
  average: number | null
  count: number
  latest: ProductReviewItem[]
}

const EMPTY: ProductReviewsData = { average: null, count: 0, latest: [] }

/** The VISIBLE reviews for a product: average, count, and the latest few (newest first).
 *  ONE query, no N+1 (the author display fields ride the embedded select). Fail-safe to empty. */
export async function getProductReviews(productId: string): Promise<ProductReviewsData> {
  if (!productId) return EMPTY
  try {
    const { data } = await db()
      .from('commerce_reviews')
      .select(
        'id, rating, body, verified_purchase, created_at, reviewer:profiles!reviewer_profile_id ( display_name, avatar_url )',
      )
      .eq('product_id', productId)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .limit(REVIEWS_CAP)
    const rows = (data ?? []) as Record<string, unknown>[]
    if (rows.length === 0) return EMPTY
    const ratings = rows.map((r) => Number(r.rating) || 0)
    const average = Math.round((ratings.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10
    const latest: ProductReviewItem[] = rows.map((r) => {
      const author = r.reviewer as { display_name?: unknown; avatar_url?: unknown } | null
      return {
        id: String(r.id),
        rating: Number(r.rating) || 0,
        body: typeof r.body === 'string' ? r.body : '',
        verifiedPurchase: r.verified_purchase === true,
        createdAt: String(r.created_at),
        author: author
          ? {
              displayName: (author.display_name as string) || 'Member',
              avatarUrl: (author.avatar_url as string) ?? null,
            }
          : null,
      }
    })
    return { average, count: rows.length, latest }
  } catch {
    return EMPTY
  }
}

/** The signed-in viewer's OWN review of a product (rating + body), or null. Prefills the form
 *  so a member edits rather than duplicates. Fail-safe to null. */
export async function getMyProductReview(
  productId: string,
  viewerId: string | null,
): Promise<{ rating: number; body: string } | null> {
  if (!productId || !viewerId) return null
  try {
    const { data } = await db()
      .from('commerce_reviews')
      .select('rating, body')
      .eq('product_id', productId)
      .eq('reviewer_profile_id', viewerId)
      .maybeSingle()
    if (!data) return null
    const row = data as Record<string, unknown>
    return { rating: Number(row.rating) || 0, body: typeof row.body === 'string' ? row.body : '' }
  } catch {
    return null
  }
}

export interface ProductRating {
  average: number
  count: number
}

/** Batch aggregate ratings for a set of products, for card grids (Market / Space Shop). One
 *  query, grouped in-process. Returns a Map keyed by product_id; a product with no visible
 *  reviews is simply absent. Fail-safe to an empty Map. */
export async function productRatingsFor(productIds: string[]): Promise<Map<string, ProductRating>> {
  const out = new Map<string, ProductRating>()
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (ids.length === 0) return out
  try {
    const { data } = await db()
      .from('commerce_reviews')
      .select('product_id, rating')
      .in('product_id', ids)
      .eq('status', 'visible')
    const sums = new Map<string, { sum: number; count: number }>()
    for (const r of (data ?? []) as { product_id?: unknown; rating?: unknown }[]) {
      const pid = String(r.product_id)
      const rating = Number(r.rating) || 0
      const acc = sums.get(pid) ?? { sum: 0, count: 0 }
      acc.sum += rating
      acc.count += 1
      sums.set(pid, acc)
    }
    for (const [pid, { sum, count }] of sums) {
      if (count > 0) out.set(pid, { average: Math.round((sum / count) * 10) / 10, count })
    }
    return out
  } catch {
    return out
  }
}

/** Whether a member has a SETTLED order (paid / fulfilled) that includes this product — the
 *  verified-purchase signal. With payments OFF no order ever settles, so this returns false and
 *  reviews carry verified_purchase = false. TODO(payments-on): once host_payouts_enabled is
 *  live, GATE review creation on this returning true (a real buyer), not just any signed-in
 *  member. Fail-safe to false. */
export async function hasPurchasedProduct(profileId: string, productId: string): Promise<boolean> {
  if (!profileId || !productId) return false
  try {
    const { data } = await db()
      .from('commerce_order_items')
      .select('id, order:commerce_orders!inner ( buyer_profile_id, status )')
      .eq('product_id', productId)
      .eq('order.buyer_profile_id', profileId)
      .in('order.status', ['paid', 'fulfilled'])
      .limit(1)
    return (data ?? []).length > 0
  } catch {
    return false
  }
}

/** Insert / update a member's review (upsert on product_id + reviewer_profile_id). The caller
 *  MUST already be authorized (a signed-in member who is not the seller). verified_purchase is
 *  derived, not client-supplied. Returns true on success. */
export async function upsertProductReview(input: {
  productId: string
  reviewerProfileId: string
  rating: number
  body: string
  verifiedPurchase: boolean
}): Promise<boolean> {
  const rating = Math.trunc(input.rating)
  if (!(rating >= 1 && rating <= 5)) return false
  const { error } = await db()
    .from('commerce_reviews')
    .upsert(
      {
        product_id: input.productId,
        reviewer_profile_id: input.reviewerProfileId,
        rating,
        body: input.body.trim().slice(0, 2000),
        verified_purchase: input.verifiedPurchase,
        status: 'visible',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id,reviewer_profile_id' },
    )
  return !error
}

/** Hide a review (operator moderation; reversible, sets status hidden rather than deleting). */
export async function hideProductReview(id: string): Promise<void> {
  const { error } = await db()
    .from('commerce_reviews')
    .update({ status: 'hidden', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Un-hide a review (operator moderation; the reverse of hideProductReview). */
export async function unhideProductReview(id: string): Promise<void> {
  const { error } = await db()
    .from('commerce_reviews')
    .update({ status: 'visible', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Operator moderation queue (the /admin/marketplace/reviews console) ──────────────────────────────
// The one place an operator SEES every product review, visible AND hidden, to spot-check and moderate.
// Reads through the admin client behind the platform-staff gate (RLS's public policy only exposes
// VISIBLE reviews on active products, which is deliberately too narrow for oversight). Mirrors
// listMarketplaceReports.

export interface ModeratedReview {
  id: string
  productId: string
  productTitle: string
  rating: number
  body: string
  status: 'visible' | 'hidden'
  createdAt: string
  reviewer: string
}

const MODERATION_CAP = 200

/** Every product review for the operator queue, newest first (visible + hidden). Carries the product
 *  title + reviewer name for the row. ONE query, no N+1 (both ride embedded selects). Fail-safe to []. */
export async function listReviewsForModeration(): Promise<ModeratedReview[]> {
  try {
    const { data } = await db()
      .from('commerce_reviews')
      .select(
        'id, product_id, rating, body, status, created_at, product:commerce_products!product_id ( title ), reviewer:profiles!reviewer_profile_id ( display_name )',
      )
      .order('created_at', { ascending: false })
      .limit(MODERATION_CAP)
    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const product = r.product as { title?: unknown } | null
      const reviewer = r.reviewer as { display_name?: unknown } | null
      return {
        id: String(r.id),
        productId: String(r.product_id),
        productTitle: (product?.title as string) || 'Untitled listing',
        rating: Number(r.rating) || 0,
        body: typeof r.body === 'string' ? r.body : '',
        status: r.status === 'hidden' ? 'hidden' : 'visible',
        createdAt: String(r.created_at),
        reviewer: (reviewer?.display_name as string) || 'Member',
      }
    })
  } catch {
    return []
  }
}

/** How many reviews are visible vs hidden, for the console's stat cards. Fail-safe to zeros. */
export async function reviewStatusCounts(): Promise<{ visible: number; hidden: number }> {
  try {
    const { data } = await db().from('commerce_reviews').select('status')
    const counts = { visible: 0, hidden: 0 }
    for (const r of (data ?? []) as { status?: unknown }[]) {
      if (r.status === 'hidden') counts.hidden += 1
      else counts.visible += 1
    }
    return counts
  } catch {
    return { visible: 0, hidden: 0 }
  }
}
