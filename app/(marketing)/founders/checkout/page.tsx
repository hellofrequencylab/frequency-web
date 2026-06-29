import type { Metadata } from 'next'
import Link from 'next/link'
import { billingLive } from '@/lib/pricing/settings'

// STUB checkout route for the live-checkout path (billingLive() === true). This is
// a PLACEHOLDER only, it does NOT charge, create a Stripe session, or take a card.
// It exists so the flag-gated live CTA has a real destination today; the real
// founding-checkout flow lands here later WITHOUT a page rewrite.
//
// While billingLive() is false (today), this page renders the "not open yet" state
// and routes the reader back to the free reservation, so a stray link can never
// imply a charge.

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

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
          Founding checkout
        </p>
        {live ? (
          <>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              Checkout is almost here.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              This is the founding checkout placeholder
              {tier ? ` for the ${tier} tier` : ''}. Live payment is being wired
              up. Your founder rate is locked in the moment it opens. Founding
              memberships are a membership, not an investment.
            </p>
            <Link
              href="/founders/offer"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Back to the offer
            </Link>
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
