import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { toProfileContext, enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { blocksForKind } from '@/lib/entity-blocks/registry'
import { parseEntityLayout, mergeEntityLayout } from '@/lib/entity-blocks/layout'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// The profile's HOME page body (ADR-508 U3 LIVE CUTOVER). The Home body now renders through the
// MODULE ENGINE (the block-picker grid), NOT Puck: it resolves the Space, builds the small render
// context (toProfileContext), and renders <SpaceProfileModules> with the operator's EFFECTIVE GRID.
//
// REVERSIBLE render swap: nothing here deletes or overwrites the stored Puck docs — the multi-page
// [page] route still renders them, and preferences.pageDocs / the S3 profileLayout node are untouched.
// Reverting is a one-line swap back to <SpaceLanding slug/>. The identity Hero + operator nav + rail
// are the (profile) layout chrome; this is just the page body (children).
//
// The body is wrapped in its OWN <Suspense> with the shared profile-body skeleton, so the chrome never
// blocks on the Space read while the modules resolve (D5). Each section inside the module render carries
// its own <Suspense>, so a slow section never blocks the ones above it.
async function SpaceProfileBody({ slug }: { slug: string }) {
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  // Re-stamp the active Space so any dynamic block reads THIS tenant's rows (mirrors the preview path).
  setActiveSpace(space)

  // The EFFECTIVE GRID: the operator's saved grid merged over the fresh default. The valid-id universe
  // (the append order AND the allowlist mergeEntityLayout drops unknown placements against) MUST match
  // the grid EDITOR's palette exactly (settings/profile/grid), or a block the operator placed there would
  // silently vanish on the live page — so build the defaultIds identically: every space block minus the
  // feature-locked ones (a DATA block whose required function is off). The saved node lives at
  // preferences.profileLayout (shared with the S3 list editor — parseEntityLayout reads the grid shape
  // AND the flat back-compat `order`). FAIL-SAFE: a malformed / absent node parses to null so the fresh
  // default stands, identical to what the editor shows.
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

  // OWNER click-to-edit (Spaces item 6): resolve the SAME owner signal the (profile) chrome layout uses
  // (resolveSpaceManageAccess → canManage || staffViewing), so the person who can manage this Space sees a
  // hover pencil on each block that deep-links to the existing grid editor. A visitor / non-owner gets no
  // editHref, so the render below stays byte-identical to before. Only a manager pays the caller read.
  const caller = await getCallerProfile()
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing

  return (
    <SpaceProfileModules
      space={toProfileContext(space)}
      grid={grid}
      editHref={canSeeAsOwner ? () => `/spaces/${space.slug}/settings/profile/grid` : undefined}
    />
  )
}

export default async function SpaceLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <SpaceProfileBody slug={slug} />
    </Suspense>
  )
}
