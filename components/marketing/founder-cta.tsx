import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { billingLive } from '@/lib/pricing/settings'
import { FoundersReserveForm } from '@/components/marketing/founders-reserve-form'
import type { FounderTier } from '@/app/(marketing)/founders/actions'

// ── The single flag-gated founding CTA (the whole point of the page) ──────────
//
// This Server Component reads `billingLive()` (lib/pricing/settings.ts) ONCE and
// branches:
//
//   • billingLive() === false  (TODAY)  -> the WAITLIST path: render the reservation
//     form. Reserving writes a lead and queues a confirm email. NOTHING charges.
//
//   • billingLive() === true   (LATER)  -> the LIVE-CHECKOUT path: render the
//     "Become a Founder, $250" CTA pointing at the stub checkout route. We do NOT
//     implement real charging here; the route is a placeholder.
//
// Only the flag changes behavior, flipping `billing_live` ON (with Stripe env keys)
// swaps the CTA without touching this component or the pages that use it.

export async function FounderCheckoutCta({
  defaultTier = 'member',
}: {
  defaultTier?: FounderTier
}) {
  const live = await billingLive()

  if (!live) {
    // WAITLIST MODE (today): reserve a spot, no charge.
    return <FoundersReserveForm defaultTier={defaultTier} />
  }

  // LIVE MODE (later): point at the stubbed checkout. Placeholder only, no
  // charging is implemented behind this link.
  return (
    <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-center">
      <Link
        href="/founders/checkout?tier=member"
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
      >
        Become a Founder, $250 <ArrowRight className="w-4 h-4" />
      </Link>
      <p className="mt-4 text-xs text-subtle leading-relaxed">
        Your founder rate is locked in at checkout. Founding memberships are a
        membership, not an investment.
      </p>
    </div>
  )
}

// A compact inline button version of the same gate, for the hero / closing CTAs
// where a full form would be too heavy. Waitlist mode anchors to the reservation
// form; live mode points at the stub checkout. `formHref` is where the waitlist
// CTA should send the reader to reach the form (an in-page anchor by default).
export async function FounderCtaButton({
  formHref = '#reserve',
}: {
  formHref?: string
}) {
  const live = await billingLive()
  if (!live) {
    return (
      <Link
        href={formHref}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors shadow-pop"
      >
        Claim a Founding spot <ArrowRight className="w-5 h-5" />
      </Link>
    )
  }
  return (
    <Link
      href="/founders/checkout?tier=member"
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors shadow-pop"
    >
      Become a Founder, $250 <ArrowRight className="w-5 h-5" />
    </Link>
  )
}
