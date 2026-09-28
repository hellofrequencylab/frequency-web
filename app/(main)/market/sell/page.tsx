import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { resolveProfilePayoutPrompt } from '@/lib/billing/payout-prompt-resolve'
import { ProductSpark } from './product-spark'

// List a product in the Market (ADR-596). Any signed-in member may list: the Market is OPEN on the
// free tier (ADR-914, owner ruling 2026-08-24 — "never gate the transaction, gate the repeat"). The
// ladder is the RATE, not the permission: a free Member's network-sourced sale settles at 10%
// (`memberFree`), a Crew seller's at 8%, and a sale to the seller's own audience is 0% on both. The
// member editor stays thin (one product at a time, no storefront); a Business Space gets the full Shop.
// Creating a product lists it to browse right away; getting PAID needs a connected payout account,
// and THIS is where that is offered (LIVE-537): the price is typed here, so this is the first sell
// attempt for a maker, and the one Connect prompt renders on the Spark's first screen with Stripe
// onboarding inline. Before that the Spark carried two hand-written go-elsewhere sentences and the
// BUYER was the one refused, at click (lib/commerce/checkout.ts).
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

  // The one Connect prompt, resolved HERE because the Spark is a client island and the reads (the
  // platform payouts switch, the maker's mirrored Stripe flags) are server-side. The maker is their
  // own payee, so `self` copy and the inline onboarding button are right. Null once they are ready
  // (ADR-1158): a maker who onboarded last week is never told to go and do it.
  const payoutPrompt = await resolveProfilePayoutPrompt({
    payeeProfileId: profile.id,
    viewerProfileId: profile.id,
    channels: ['orders'],
  })

  // The prompt and the upgrade path to a full Shop both ride on the Spark's first screen (its
  // `aside`), where a seller is still deciding how to start, rather than under a half-filled form.
  return <ProductSpark payoutPrompt={payoutPrompt} />
}
