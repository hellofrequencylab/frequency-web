import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { spaceEmailColors, spaceEmailColorDefaults } from '@/lib/spaces/email-colors'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { EmailStyleEditor } from '@/components/spaces/email/email-style-editor'

// SPACE EMAIL STYLE (Email in the Business CRM, P1 · deliverable 3). The settings-rail surface that tunes the
// brand-derived email palette a Space's emails default to. A centered Focus surface reached from the space
// settings rail (the `space.emailstyle` module). Gates RENDER on canManage || staffViewing (404s otherwise),
// mirrors the Email surface's plan gate, and hands the editor the currently RESOLVED palette (default + brand +
// saved override) plus the brand-only defaults (what "reset" returns to). WRITE stays gated on canEditProfile
// server-side (setSpaceEmailStyle), so a staff janitor previews read-only.

export const metadata = {
  title: 'Email style',
}

export default async function SpaceEmailStylePage({
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

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked =
    !staffViewing && !(await spaceFunctionAccessLive(space, 'email', caps.role, space.plan))

  if (featureLocked) {
    return (
      <FocusTemplate eyebrow={brandName} title="Email style" description="Brand colors for your emails.">
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Email style"
          reason={spaceHasEntitlement(space, 'email') ? 'role' : 'plan'}
          canManageMembers={caps.canManageMembers}
          featureKey="space_email"
          currentPlan={space.plan}
        />
      </FocusTemplate>
    )
  }

  const current = spaceEmailColors(space)
  const brandDefaults = spaceEmailColorDefaults(space)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Email style"
      description="Set the colors your emails use by default. They start from your space brand."
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      <EmailStyleEditor
        slug={space.slug}
        current={current}
        brandDefaults={brandDefaults}
        readOnly={staffViewing}
      />
    </FocusTemplate>
  )
}
