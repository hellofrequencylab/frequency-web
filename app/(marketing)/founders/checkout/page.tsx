import type { Metadata } from 'next'
import Link from 'next/link'
import { billingLive } from '@/lib/pricing/settings'
import { FounderCheckoutButton } from '@/components/marketing/founder-checkout-button'
import { asFounderTier, type FounderTier } from '@/lib/billing/founders'

// The one-time Founders Round checkout route.
//
// While billingLive() is false (today), this page renders the "not open yet" state and
// routes the reader back to the free reservation, so a stray link can never imply a charge.
//
// When billingLive() is true (after the owner flips billing_live), it renders the real
// "Complete your founding membership" CTA, which calls the GATED createFounderCheckout
// server action and redirects to Stripe. The gate lives in the action, not the page, so
// even a live render cannot charge until billing is actually on.

export const metadata: Metadata = {
  title: 'Founding checkout',
  robots: { index: false },
}

export default async function FoundersCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>
}) {
  const { tier } = await searchParams
  const live = await billingLive()
  const defaultTier: FounderTier = asFounderTier(tier) ?? 'member'

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
          Founding checkout
        </p>
        {live ? (
          <>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              Complete your founding membership.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              Pick your tier and check out. Your founder rate is locked in the moment
              you join. Founding memberships are a membership, not an investment.
            </p>
            <FounderCheckoutButton defaultTier={defaultTier} />
          </>
        ) : (
          <>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              Checkout isn&apos;t open yet.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              Right now you&apos;re reserving your founding spot, no charge. Founders
              are charged first when checkout opens, at the locked founder price.
            </p>
            <Link
              href="/founders/offer"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Reserve my Founding spot
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
