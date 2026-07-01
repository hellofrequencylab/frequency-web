import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getOwnerDonationAsk } from '@/lib/spaces/donations'
import { DonationAskForm } from '@/components/spaces/donations/donation-ask-form'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import type { Space } from '@/lib/spaces/types'

// DONATIONS section BODY (extracted from donations/page.tsx so the unified Offerings surface can compose
// it as one stacked section). The route + auth gate stays on the caller (the Offerings page). The WRITE
// action (setDonationAsk, behind DonationAskForm) is unchanged and stays the source of truth
// (canEditProfile server-side). This component re-checks the donations function gate and loads the same
// ask the page always loaded.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment and there is no Stripe path. No em/en dashes.

export async function DonationsSection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'donations', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Donations"
        reason={spaceFunctionAccess(space, 'donations', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  const ask = await getOwnerDonationAsk(space.id)

  return (
    // A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables every
    // nested control in the form). `display: contents` keeps it out of the layout box.
    <fieldset disabled={staffViewing} className="contents">
      <DonationAskForm spaceId={space.id} slug={space.slug} initialAsk={ask} />
    </fieldset>
  )
}
