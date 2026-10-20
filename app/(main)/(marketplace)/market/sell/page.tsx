import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { resolveProfilePayoutPrompt } from '@/lib/billing/payout-prompt-resolve'
import { loadUpgradeOffer } from '@/lib/pricing/business-offer'
import { ProductSpark } from './product-spark'

// List a product in the Market (ADR-596). Any signed-in member may list. Since ADR-1709 (LIVE-753) a
// personal listing is an INQUIRY: personal selling is off on every personal tier, so the buyer
// messages the maker rather than checking out (canTakePayments('profile') is false), and the money a
// person receives is tips, at 0%. Taking payment for a listing is what a Business Space is for; a
// Business Space gets the full Shop with checkout.
//
// 🔴 There used to be an `isPaid(profile.realMembershipTier)` wall here rendering "Selling is a paid
// feature". It is deliberately gone and must not come back: nobody loses a listing behind a wall. The
// upgrade path rides beside the price instead (the upgrade moment, LIVE-758). The lock is
// `app/(main)/marketplace/free-seller.test.tsx`.
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
  return <ProductSpark payoutPrompt={payoutPrompt} upgradeOffer={await loadUpgradeOffer()} />
}
