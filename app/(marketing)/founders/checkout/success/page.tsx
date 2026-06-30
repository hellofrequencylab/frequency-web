import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { billingLive } from '@/lib/pricing/settings'
import { confirmFounderCheckout } from '@/app/(marketing)/founders/checkout/actions'
import { founderTierLabel } from '@/lib/billing/founders'

// The Founders Round thank-you page. Reached from Stripe's success_url after a paid
// one-time founding checkout. It confirms the founding membership on the redirect (a
// webhook-independent grant; idempotent and shared with the webhook), then thanks the
// new Founder. Still gated: if billing is OFF it never calls Stripe and shows the
// not-open copy, so the route is inert until the owner flips billing_live.

export const metadata: Metadata = {
  title: 'You are a Founder',
  robots: { index: false },
}

export default async function FoundersSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams
  const live = await billingLive()

  // Confirm on the redirect (grants the founding membership if the session is paid + ours).
  // Idempotent: the webhook may have already granted it.
  const result = live && session_id ? await confirmFounderCheckout(session_id) : null
  const confirmed = result?.ok === true
  const tierLabel = result?.ok === true ? founderTierLabel(result.tier) : 'Founding Member'

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        {confirmed ? (
          <>
            <div className="mx-auto w-12 h-12 rounded-full bg-success-bg text-success flex items-center justify-center mb-5">
              <Check className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              You are a Founder
            </p>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              Welcome to the founding cohort.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              You are a {tierLabel}. Your founder rate is locked in, and your Founder role
              is recorded for good. We will be in touch with the first founding steps. A
              membership, not an investment.
            </p>
            <Link
              href="/founder"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              See your Founder home
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              Founding checkout
            </p>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              {live ? 'Almost there.' : "Checkout isn't open yet."}
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              {live
                ? 'We are confirming your founding membership. If your payment went through, your Founder status will appear shortly. If this page looks wrong, your spot is still held at the founder rate.'
                : 'Right now you are reserving your founding spot, no charge. Founders are charged first when checkout opens, at the locked founder price.'}
            </p>
            <Link
              href="/founders/offer"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Back to the offer
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
