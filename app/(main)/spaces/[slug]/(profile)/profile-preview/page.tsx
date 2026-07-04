import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { PageHeading } from '@/components/templates'
import { toProfileContext, enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { blocksForKind } from '@/lib/entity-blocks/registry'
import { parseEntityLayout, mergeEntityLayout } from '@/lib/entity-blocks/layout'
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

  // Render through the SAME function-only grid the LIVE page uses (the (profile)/page.tsx visitor path),
  // NOT the flat type-shaped fallback: the operator's saved grid merged over the function-filtered
  // blocksForKind('space') palette. This keeps the preview and the live page uniform (the palette gates
  // on the space's live functions only, never its type), so the preview validates the real render.
  const enabled = enabledFunctionKeys(space)
  const paletteIds = blocksForKind('space')
    .filter((b) => b.requiresFunction == null || enabled.has(b.requiresFunction))
    .map((b) => b.id)
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const grid = mergeEntityLayout(paletteIds, parseEntityLayout(rawLayout), 'space')

  return (
    <div className="space-y-8">
      <PageHeading
        title="Profile preview (block-picker)"
        description="A module-rendered view of this profile, off Puck. Staff preview only, nothing live changes."
        adminBar={false}
      />
      <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
    </div>
  )
}
