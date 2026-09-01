import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { ProductSpark } from './product-spark'

// List a product in the Market (ADR-596). Any signed-in member may list: the Market is OPEN on the
// free tier (ADR-914, owner ruling 2026-08-24 — "never gate the transaction, gate the repeat"). The
// ladder is the RATE, not the permission: a free Member's network-sourced sale settles at 10%
// (`memberFree`), a Crew seller's at 8%, and a sale to the seller's own audience is 0% on both. The
// member editor stays thin (one product at a time, no storefront); a Business Space gets the full Shop.
// Creating a product lists it to browse right away; getting PAID needs a connected payout account.
//
// 🔴 There used to be an `isPaid(profile.realMembershipTier)` wall here rendering "Selling is a paid
// feature". It is deliberately gone and must not come back: a paywall at the moment someone has
// decided to charge sends them to Venmo, and neither the sale nor the contact ever returns. The lock
// is `app/(main)/marketplace/free-seller.test.tsx`.
//
// The form is the Product SPARK (docs/STUDIO.md §0, ADR-986): two doors, the shared drop zone, and the
// fields PRODUCT_MANIFEST declares. The Spark brings its own centered column + heading, so this page
// renders it directly.

export const metadata = { title: 'List a product' }

export default async function MarketSellPage() {
  const profile = await getCallerProfile()
  if (!profile) redirect('/sign-in?next=/market/sell')

  // The upgrade path to a full Shop rides on the Spark's first screen (its `aside`), where a seller is
  // still deciding how to start, rather than under a half-filled form.
  return <ProductSpark />
}
