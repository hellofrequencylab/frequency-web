import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const db = createAdminClient()
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

  const endsLabel = new Date(offer.endsAtMs).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' })

  return (
    <FocusTemplate
      eyebrow="Beta offer"
      title={`${space.name} is ready. Keep it going.`}
      description={`Your Space is free and stays free. Pay before ${endsLabel} Pacific and you lock in Beta pricing for as long as you keep your plan, plus the Founder badge while the Beta runs through ${BETA_ENDS_LABEL}. After that this offer is gone and plans start at the regular price. The countdown stays at the top of every page.`}
      back={{ href: `/spaces/${space.slug}`, label: 'Back to your Space' }}
      width="wide"
    >
      <BillingBody slug={space.slug} />
    </FocusTemplate>
  )
}
