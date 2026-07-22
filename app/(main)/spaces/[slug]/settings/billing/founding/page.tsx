import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, MapPin } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { resolveFoundingBusinessOffer, spaceCohortCity } from '@/lib/founding/business-checkout'
import { FoundingCheckout } from './founding-checkout'

// FOUNDING BUSINESS CHECKOUT PAGE (ADR-804). The owner-facing surface to lock the founding Business
// rate for a Space (the per-city fee-buydown cohort). Composes the FOCUS template (a centered, single
// conversion surface, PAGE-FRAMEWORK §3). It owns the ROUTE + AUTH gate once (resolveSpaceManageAccess,
// notFound on a miss so there is no existence leak), resolves the offer, then branches by the checkout
// state:
//   • already_active -> a "you already pay" card (no double-subscribe).
//   • sold_out       -> a per-city "cohort is full" card.
//   • not_open        -> the marketing PREVIEW with a disabled "Available soon" button (billing OFF, the
//                        ADR-362 invariant: the surface renders but no Stripe charge is possible).
//   • open           -> the LIVE checkout (the Monthly / Annual toggle + buy button).
// The buy CTA is GATED inside the seam (createFoundingBusinessCheckout), so even the live render cannot
// charge until billing is on. No em dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'Founding Business',
  robots: { index: false },
}

function usd(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toFixed(2)}`
}

export default async function FoundingBusinessCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const billingHref = `/spaces/${space.slug}/settings/billing`

  // Prefill the city from any founding record the Space already holds; resolve the offer against it.
  const knownCity = await spaceCohortCity(space.id)
  const offer = await resolveFoundingBusinessOffer(space.id, knownCity)

  // ── already_active: the Space already pays. No double-subscribe. ──
  if (offer.state === 'already_active') {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="You are already on a paid plan"
        description="This space has an active subscription, so there is nothing to buy here."
        back={{ href: billingHref, label: 'Plan and usage' }}
      >
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-sm font-bold text-text">Active plan</p>
              <p className="mt-1 text-sm text-muted">
                Your plan and usage live on the billing page. If you locked the founding rate, it stays
                yours for the life of the subscription.
              </p>
              <Link href={billingHref} className="mt-3 inline-block text-sm font-semibold text-primary-strong underline">
                Go to plan and usage
              </Link>
            </div>
          </div>
        </div>
      </FocusTemplate>
    )
  }

  // ── sold_out: the founding cohort for this Space's city is full. ──
  if (offer.state === 'sold_out') {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="The founding cohort is full"
        description={`Every founding Business spot in ${offer.cohortCity ?? 'this city'} is taken.`}
        back={{ href: billingHref, label: 'Plan and usage' }}
      >
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-bold text-text">
                All {offer.cityCap} founding spots are taken{offer.cohortCity ? ` in ${offer.cohortCity}` : ''}.
              </p>
              <p className="mt-1 text-sm text-muted">
                The founding round is small on purpose. You can still go Business at standard pricing from
                the billing page.
              </p>
              <Link href={billingHref} className="mt-3 inline-block text-sm font-semibold text-primary-strong underline">
                See the Business plan
              </Link>
            </div>
          </div>
        </div>
      </FocusTemplate>
    )
  }

  // ── open (live) or not_open (preview): render the checkout. sellable gates the button. ──
  const description =
    offer.state === 'open'
      ? `Be one of the first ${offer.cityCap} businesses in your city. Lock ${usd(offer.monthlyCents)} a month and a marketplace fee bought down to ${(offer.takeBps / 100).toString()}%, grandfathered for life.`
      : `Founding checkout is not open yet. Here is the offer: ${usd(offer.monthlyCents)} a month and a ${(offer.takeBps / 100).toString()}% marketplace fee, locked for life, capped at ${offer.cityCap} businesses per city.`

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Become a Founding Business"
      description={description}
      back={{ href: billingHref, label: 'Plan and usage' }}
    >
      <FoundingCheckout
        slug={space.slug}
        monthlyCents={offer.monthlyCents}
        annualCents={offer.annualCents}
        annualSavingsCents={offer.annualSavingsCents}
        takeBps={offer.takeBps}
        cityCap={offer.cityCap}
        spotsRemaining={offer.spotsRemaining}
        defaultCity={offer.cohortCity ?? ''}
        sellable={offer.state === 'open' && !staffViewing}
      />
    </FocusTemplate>
  )
}
