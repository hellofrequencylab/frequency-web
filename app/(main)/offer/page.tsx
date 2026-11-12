import { HOME_TZ } from '@/lib/time/home-zone'
import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { startOperatorOffer } from '@/lib/offers/operator-offer-server'
import { BETA_ENDS_LABEL } from '@/lib/core/beta-notices'
import { BillingBody } from '../spaces/[slug]/settings/billing/billing-body'

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
    .select('slug, name')
    .eq('owner_profile_id', caller.id)
    .order('created_at', { ascending: true })
  const mine = spaces ?? []
  const space = mine.find((s) => s.slug === requested) ?? mine[0]
  if (!space) redirect('/spaces/new')

  const offer = await startOperatorOffer(caller.id)
  if (offer.status !== 'live') redirect(`/spaces/${space.slug}/settings/billing`)

  const endsLabel = new Date(offer.endsAtMs).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: HOME_TZ })

  return (
    <FocusTemplate
      eyebrow="Beta offer"
      title={`${space.name} is ready. Keep it going.`}
      description={`This offer window closes ${endsLabel} Pacific. The beta runs through ${BETA_ENDS_LABEL}, 2027. Review the current plan options, prices and fees below. Founding Member recognition is free; Founding Year is a separate paid first-year offer. Check /pricing for current Founding Year availability, eligibility and terms.`}
      back={{ href: `/spaces/${space.slug}`, label: 'Back to your Space' }}
      width="wide"
    >
      <BillingBody slug={space.slug} />
    </FocusTemplate>
  )
}
