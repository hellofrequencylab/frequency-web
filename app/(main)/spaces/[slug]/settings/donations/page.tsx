import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getOwnerDonationAsk } from '@/lib/spaces/donations'
import { DonationAskForm } from '@/components/spaces/donations/donation-ask-form'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'

// OWNER DONATION ASK EDITOR (ENTITY-SPACES-SYSTEM §2.6, donations v1; MASTER-PLAN item ADMIN-01). A
// centered, no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/donations in
// page-chrome.ts, alongside memberships). It resolves the Space, gates RENDER on canManage ||
// staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the surface exists),
// then renders the donation-ask editor (setDonationAsk behind the form), seeded with the current ask.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editor is wrapped in a disabled fieldset (read-only). The write action (setDonationAsk) stays gated
// on canEditProfile SERVER-SIDE, so staff viewing never confers a write. NOTE: the seeded ask
// (getOwnerDonationAsk) is itself gated on canEditProfile (or a janitor preview), so a staff viewer
// sees the editor structure read-only.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment and there is no Stripe path. The page
// description and the editor say plainly that giving is not yet wired and no money changes hands.
// No em or en dashes.

export const metadata = {
  title: 'Donations',
}

export default async function SpaceDonationsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE action (setDonationAsk) stays gated on canEditProfile
  // SERVER-SIDE, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The default (donations = editor) reproduces the
  // old canEditProfile threshold; a staff janitor keeps the read-only preview (write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'donations', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Donations"
        description="The donation fund for this space."
        back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Donations"
          reason={spaceFunctionAccess(space, 'donations', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const ask = await getOwnerDonationAsk(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Donations"
      description="Set up your fund and the amounts members can pick. We do not take a payment yet, so giving is not wired and no money changes hands. Paid giving and tax receipts come later."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
          every nested control in the form). `display: contents` keeps it out of the layout box. */}
      <fieldset disabled={staffViewing} className="contents">
        <DonationAskForm spaceId={space.id} slug={space.slug} initialAsk={ask} />
      </fieldset>
    </FocusTemplate>
  )
}
