import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { PageHeading } from '@/components/templates'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'

// STAFF-PREVIEW: the module-engine (block-picker) render of a space profile, shown BESIDE the live Puck
// landing so an owner/editor can validate the non-Puck render without changing anything live. Nothing
// here touches the public profile: the live (profile)/page.tsx still renders SpaceLanding (Puck).
//
// GATE: the SAME gate the Puck editor uses (resolveSpaceManageAccess) — a manager (owner/admin/editor)
// or a platform janitor previewing. notFound (not a redirect) for everyone else, so the route never
// leaks. Sits inside the (profile) route group, so it inherits the profile hero + sub-nav chrome and
// the module body renders where the Puck body normally would.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Profile preview (block-picker)',
  robots: { index: false, follow: false },
}

export default async function SpaceProfilePreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the space, failing closed on a missing / not-visible one (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  // Only a manager or a platform janitor may preview; everyone else 404s (the route stays hidden).
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  return (
    <div className="space-y-8">
      <PageHeading
        title="Profile preview (block-picker)"
        description="A module-rendered view of this profile, off Puck. Staff preview only, nothing live changes."
        adminBar={false}
      />
      <SpaceProfileModules space={toProfileContext(space)} />
    </div>
  )
}
