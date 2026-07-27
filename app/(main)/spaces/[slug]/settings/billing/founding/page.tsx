import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { formatCents } from '@/lib/pricing/display'
import { resolveFoundingBusinessOffer, spaceCohortCity } from '@/lib/founding/business-checkout'
import { FoundingCta } from './founding-cta'

// FOUNDING BUSINESS (ADR-599 / ADR-803 / ADR-811) — the per-city founding cohort's own surface.
//
// This route is the seam that was missing. `createFoundingBusinessCheckout` already redirected here
// (success_url and cancel_url both point at /settings/billing/founding[/success]) but the segment did
// not exist, so the offer had no button, no link, and no page: a `founding_members` business row could
// never be created through checkout at all.
//
// ADMIN-gated, matching the billing floor its sibling actions use — this starts a subscription on the
// owner's card, so an editor must not reach it. notFound() on a miss, so there is no existence leak.
//
// Everything the page states comes from `resolveFoundingBusinessOffer`, which the ACTION re-resolves
// with the submitted city before creating a session. The two therefore cannot disagree about the rate,
// the cap, or whether the offer is open. No figure is hardcoded. No em dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'Founding Business',
}

export default async function FoundingBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.isAdmin) notFound()

  const brandName = space.brandName ?? space.name
  const cohortCity = await spaceCohortCity(space.id)
  const offer = await resolveFoundingBusinessOffer(space.id, cohortCity)

  // One sentence per blocked state, so the CTA never has to invent copy.
  const blockedReason =
    offer.state === 'already_active'
      ? 'This Space already has a plan, so it cannot start a founding checkout.'
      : offer.state === 'sold_out'
        ? 'The founding spots for that city are taken.'
        : offer.state === 'not_open'
          ? 'Founding spots are not open yet. Nothing is charged until they are.'
          : null

  const takePercent = (offer.takeBps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Founding Business"
      description="A capped number of businesses per city lock in the opening rate and keep it. This is that offer for this Space."
    >
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">The rate you lock</p>
          <p className="mt-1 text-2xl font-bold text-text">
            {formatCents(offer.monthlyCents)}
            <span className="text-base font-semibold text-muted">/mo</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Or {formatCents(offer.annualCents)} a year, which is {offer.monthsFree}{' '}
            {offer.monthsFree === 1 ? 'month' : 'months'} free and saves{' '}
            {formatCents(offer.annualSavingsCents)}.
          </p>
          <p className="mt-3 text-sm text-muted">
            You keep 100% of your own bookings. The network take-rate on business the network sends you
            is {takePercent}%, and it is locked at that for as long as you stay.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface-elevated px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Spots</p>
          <p className="mt-1 text-sm text-text">
            {offer.cohortCity
              ? `${offer.spotsRemaining} of ${offer.cityCap} left in ${offer.cohortCity}.`
              : `${offer.cityCap} per city. Enter your city below to see what is left.`}
          </p>
        </section>

        <FoundingCta
          slug={slug}
          open={offer.state === 'open'}
          blockedReason={blockedReason}
          defaultCity={offer.cohortCity ?? ''}
        />

        <p className="text-2xs text-subtle">
          <Link href={`/spaces/${slug}/settings/billing`} className="font-semibold text-primary-strong hover:underline">
            Back to plan and usage
          </Link>
        </p>
      </div>
    </FocusTemplate>
  )
}
