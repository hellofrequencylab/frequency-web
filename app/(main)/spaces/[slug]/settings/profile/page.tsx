import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionDef } from '@/lib/spaces/functions'
import { PROFILE_BLOCKS, type ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { effectiveProfileLayout } from '@/lib/spaces/profile-layout'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import {
  ProfileLayoutEditor,
  type EditorBlock,
  type LockedBlock,
} from '@/components/spaces/profile-layout-editor'

// SPACE PROFILE LAYOUT EDITOR (Epic 1.7, S3 block-picker). A centered, no-rail Focus sub-page where the
// operator arranges the sections of their space profile: reorder, toggle on/off, and see which sections
// are locked behind a feature that is off. ADDITIVE: the live public profile stays the Puck landing
// (components/spaces/space-landing.tsx); this edits the module-engine layout the S2 staff preview
// (/spaces/<slug>/profile-preview) renders. The cutover (making this the live editor) is S4.
//
// GATING mirrors the sibling settings sub-pages: resolve the Space, fail closed on a missing / not-
// visible Space (404, no existence leak), then gate RENDER on canManage || staffViewing. The WRITE
// action (saveSpaceProfileLayout) re-gates on canManage server-side, so a staff janitor sees the
// editor read-only end to end. NOINDEX is inherited from the parent settings layout. No em dashes.

export const metadata = {
  title: 'Profile layout',
}

export default async function SpaceProfileLayoutPage({
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

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404 for
  // everyone else. The WRITE action stays gated on canManage, so a staff viewer sees the editor
  // read-only.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // The fresh default gated by the Space's live function set, with the operator's saved edits merged
  // over it -> the effective (shown, ordered) block ids.
  const enabled = enabledFunctionKeys(space)
  const effective = effectiveProfileLayout(space, space.preferences)
  const effectiveSet = new Set(effective)

  // Every registry block that applies to this Space's type. A function-gated block whose feature is OFF
  // renders LOCKED (not arrangeable); every other applicable block is arrangeable, shown or hidden.
  const applicable = PROFILE_BLOCKS.filter(
    (b) => b.types.includes('*') || b.types.includes(space.type),
  )
  const isLocked = (requiresFunction: (typeof applicable)[number]['requiresFunction']) =>
    requiresFunction !== null && !enabled.has(requiresFunction)

  const locked: LockedBlock[] = applicable
    .filter((b) => isLocked(b.requiresFunction))
    .map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      featureLabel: (b.requiresFunction && spaceFunctionDef(b.requiresFunction)?.label) || 'the feature',
    }))

  // Arrangeable blocks: applicable + not locked. Ordered by the effective (saved-merged) order first,
  // then any hidden block appended in default order. `shown` = present in the effective layout.
  const nonLocked = applicable.filter((b) => !isLocked(b.requiresFunction))
  const byId = new Map(nonLocked.map((b) => [b.id, b]))
  const orderedIds: ProfileBlockId[] = []
  for (const id of effective) if (byId.has(id)) orderedIds.push(id)
  for (const b of nonLocked) if (!effectiveSet.has(b.id)) orderedIds.push(b.id)

  const blocks: EditorBlock[] = orderedIds.map((id) => {
    const b = byId.get(id)!
    return { id, label: b.label, description: b.description, shown: effectiveSet.has(id) }
  })

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Profile layout"
      description="Arrange the sections of your space page. Reorder them, turn each on or off, and preview the result."
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <ProfileLayoutEditor
        spaceId={space.id}
        slug={space.slug}
        blocks={blocks}
        locked={locked}
        readOnly={staffViewing}
      />

      <p className="mt-6 text-xs text-muted">
        Want to see it live?{' '}
        <Link href={`/spaces/${space.slug}/profile-preview`} className="font-semibold text-primary-strong hover:underline">
          Open the profile preview
        </Link>
        .
      </p>
    </FocusTemplate>
  )
}
