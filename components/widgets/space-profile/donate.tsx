import Link from 'next/link'
import { getDonationAsk } from '@/lib/spaces/donations'
import { spaceCanTakeDonations } from '@/lib/billing/space-donation-checkout'
import { createSpaceCtaClickToken } from '@/lib/spaces/cta-click-token'
import { inSpotlightPreview } from '@/lib/spaces/spotlight-site'
import { DonateForm } from '@/components/spaces/donations/donate-form'
import { DonateCtaTracker } from '@/components/spaces/donations/donate-cta-tracker'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { ModuleSection } from './section'

// DONATE (the Space Spotlight, SPL-13): the Space's own fund as a card on its link page. It draws the SAME
// fund and the SAME checkout the Donate tab does (getDonationAsk, DonateForm -> startSpaceDonationCheckout), so
// the money lands where it already lands and the fee rule is the one the checkout applies; nothing new is
// charged here. Business and up falls out of spaceCanTakeDonations, which already runs the payments gate and
// asks for a payout account that can take a gift.
//
// A PUBLIC LINK PAGE SHOWS A WORKING CARD OR NOTHING. Unlike the Donate tab there is no preview-amounts
// fallback and no setup prompt here: the page is ISR with no cookies, so it reads nothing about the viewer, and
// a visitor is never shown a button that cannot take a gift. Only the Spotlight editor's console preview
// (inSpotlightPreview) shows the owner one quiet line saying what is missing; the Space page never does. FAIL-SAFE: any read that fails reads as "not ready".
export async function DonateBlock({
  space,
  header,
}: {
  space: SpaceProfileContext
  header?: { eyebrow?: string; heading?: string }
}) {
  const [ask, canGive] = await Promise.all([getDonationAsk(space.id), spaceCanTakeDonations(space.id)])

  if (!ask?.id || !canGive) {
    if (!inSpotlightPreview()) return null
    return (
      <ModuleSection anchor="donate">
        <p className="rounded-card border border-dashed border-border bg-surface p-4 text-body-sm text-muted">
          Your Donate card shows here once your fund is set up and payouts are on.{' '}
          <Link href={`/spaces/${space.slug}/settings/offerings#donations`} className="font-semibold text-primary-strong">
            Set up your fund
          </Link>
        </p>
      </ModuleSection>
    )
  }

  const eyebrow = header?.eyebrow
  const heading = header?.heading ?? ask.fundLabel
  return (
    <ModuleSection anchor="donate">
      <div className="rounded-card border border-border bg-surface p-5 lift-1">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-card-title font-bold text-text">{heading}</h2>
        {ask.description && <p className="mt-2 text-body-sm text-muted">{ask.description}</p>}
        <div className="mt-4">
          <DonateCtaTracker spaceId={space.id} clickToken={createSpaceCtaClickToken(space.id, 'donate')}>
            <DonateForm
              spaceId={space.id}
              suggestedAmountsCents={ask.suggestedAmountsCents}
              idPrefix={`spotlight-donate-${space.id}`}
            />
          </DonateCtaTracker>
        </div>
        <p className="mt-3 text-meta text-muted">Gifts are handled by Stripe and go straight to this Space. You get a receipt by email.</p>
      </div>
    </ModuleSection>
  )
}
