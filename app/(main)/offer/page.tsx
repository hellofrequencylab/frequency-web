import { HOME_TZ } from '@/lib/time/home-zone'
import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { founderSeatFor, founderSeatsTaken, startOperatorOffer } from '@/lib/offers/operator-offer-server'
import { BETA_ENDS_LABEL } from '@/lib/core/beta-notices'
import { BillingBody } from '../spaces/[slug]/settings/billing/billing-body'
import { StatCard } from '@/components/ui/stat-card'
import { FOUNDING_YEAR, founderSeatsLeft, foundingYearOpen } from '@/lib/billing/founding-year'

// THE BETA OFFER, full page. Reached automatically once a new Space owner has built something, and from
// the countdown strip afterwards. Opening it starts the person's clock (once, ever); the plan ladder
// below is the Space's own billing ladder, so every package (Business, Collective, Network, Non Profit)
// checks out through the same Stripe prices and the same rate lock as everywhere else. Once the clock
// has run out the offer is gone: this page sends the person to their Space's plain plan page.

export const metadata = {
  title: 'Your Beta offer',
  robots: { index: false, follow: false },
}

export default async function OfferPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in?next=/offer')

  const { space: requested } = await searchParams
  const db = await createClient()
  const { data: spaces } = await db
    .from('spaces')
    .select('id, slug, name')
    .eq('owner_profile_id', caller.id)
    .order('created_at', { ascending: true })
  const mine = spaces ?? []
  const space = mine.find((s) => s.slug === requested) ?? mine[0]
  if (!space) redirect('/spaces/new')

  const offer = await startOperatorOffer(caller.id)
  if (offer.status !== 'live') redirect(`/spaces/${space.slug}/settings/billing`)

  // THE FOUNDER SEATS (LIVE-2542, owner 2026-11-23: "150, numbered and visible"). Both reads fail safe to
  // null, which hides the count rather than printing a number we could not read.
  const [taken, mySeat] = await Promise.all([founderSeatsTaken(), founderSeatFor(space.id)])

  const endsLabel = new Date(offer.endsAtMs).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: HOME_TZ })

  return (
    <FocusTemplate
      eyebrow="Beta offer"
      title={`${space.name} is ready. Keep it going.`}
      description={`This offer window closes ${endsLabel} Pacific. The beta runs through ${BETA_ENDS_LABEL}, 2027. Review the current plan options, prices and fees below. Founding Member recognition is free; Founding Year is a separate paid first-year offer. Check /pricing for current Founding Year availability, eligibility and terms.`}
      back={{ href: `/spaces/${space.slug}`, label: 'Back to your Space' }}
      width="wide"
    >
      <FounderSeats taken={taken} mySeat={mySeat} />
      <BillingBody slug={space.slug} />
    </FocusTemplate>
  )
}

/** The public Founders seat count, and this Space's own number once it holds one. */
function FounderSeats({ taken, mySeat }: { taken: number | null; mySeat: number | null }) {
  if (taken === null) return null
  const cap = FOUNDING_YEAR.seatCap
  const left = founderSeatsLeft(taken)
  const shown = Math.min(taken, cap)
  const detail = mySeat
    ? `Your Space is one of the Founders: seat ${mySeat} of ${cap}.`
    : left > 0 && foundingYearOpen()
      ? `${left} left. A seat is yours when you pay the Founding Year: pick Yearly below.`
      : 'All 150 seats for Founders are taken.'
  return (
    <section aria-label="Seats for Founders" className="mb-6 max-w-sm">
      <StatCard label="Seats taken by Founders" value={`${shown} of ${cap}`} detail={detail} />
    </section>
  )
}
