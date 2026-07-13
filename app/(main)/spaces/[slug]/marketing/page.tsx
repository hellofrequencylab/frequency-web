import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { spaceEmailColors } from '@/lib/spaces/email-colors'
import { listSpaceEmailDrafts } from '@/lib/spaces/email-drafts'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceEmailWorkspace } from '@/components/spaces/marketing/space-email-workspace'

// SPACE MARKETING (Email in the Business CRM, P1 · deliverable 2). The full on-canvas email editor embedded in
// the business-space CRM. A wide, no-right-rail workspace (registered in page-chrome.ts) that resolves the
// Space, gates RENDER on canManage || staffViewing (404s otherwise so a non-editor cannot tell it exists), and
// mounts the SHARED Email Studio workspace wired to this Space's own drafts and seeded from the Space brand
// palette (spaceEmailColors). WRITE actions stay gated on canEditProfile server-side, so a staff janitor
// previewing reads it but can never mutate.
//
// GATING mirrors the plain-text Email surface exactly: email is PLAN-gated (spaceFunctionAccessLive), so a free
// Space sees the upgrade nudge, and only a paying Business / Non Profit reaches the editor.

export const metadata = {
  title: 'Marketing',
}

export default async function SpaceMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PLAN + role gate (ADR-370), identical to the Email surface. A locked Space (email plan/role-gated for a
  // non-staff viewer) reads the plain FeatureLockedNotice in the narrow framing; a staff janitor keeps the
  // read-only preview.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked =
    !staffViewing && !(await spaceFunctionAccessLive(space, 'email', caps.role, space.plan))

  if (featureLocked) {
    return (
      <FocusTemplate eyebrow={brandName} title="Marketing" description="Branded emails for this space.">
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Marketing"
          reason={spaceHasEntitlement(space, 'email') ? 'role' : 'plan'}
          canManageMembers={caps.canManageMembers}
          featureKey="space_email"
          currentPlan={space.plan}
        />
      </FocusTemplate>
    )
  }

  // The editor renders for an authorized viewer. The initial draft list + the brand palette are resolved
  // server-side; the client workspace binds the space-scoped actions and mounts the shared canvas editor.
  const [colors, initialCampaigns] = await Promise.all([
    Promise.resolve(spaceEmailColors(space)),
    listSpaceEmailDrafts(space.id),
  ])

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Marketing"
      description="Design a branded email on the canvas, block by block. It starts in your space colors."
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      <SpaceEmailWorkspace spaceId={space.id} initialCampaigns={initialCampaigns} colors={colors} />
    </FocusTemplate>
  )
}
