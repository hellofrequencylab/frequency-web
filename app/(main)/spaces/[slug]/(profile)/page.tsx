import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { OwnerSpaceLayoutPreview } from '@/components/spaces/owner-space-layout-preview'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { SpaceBodyPanel } from '@/components/spaces/workspace/space-body-panel'
import { isPanelId } from '@/components/spaces/workspace/surface-panels'

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
async function SpaceProfileBody({ slug, panel, area }: { slug: string; panel?: string; area?: string }) {
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  // Re-stamp the active Space so any dynamic block reads THIS tenant's rows (mirrors the preview path).
  setActiveSpace(space)

  // The EFFECTIVE GRID (the VISITOR / public render path). The saved node lives at preferences.profileLayout
  // (shared with the rail Space builder — parseEntityLayout reads the freeform ROWS shape AND the legacy
  // slots / flat `order`). Hand the parsed layout straight to the renderer so the public page resolves it
  // the SAME way the owner preview does (both call resolveRows over exactly this node): rows render the
  // operator's arrangement; a legacy layout maps through its template; an absent one falls to the kind's
  // starter — byte-for-byte the signed-in view, minus the nav + rail.
  //
  // This REPLACES the old mergeEntityLayout path, which understood only the legacy slots/order shape: it
  // ignored `rows` and APPENDED the entire block palette to the default slot, so on a modern rows-native
  // Space the public page dumped every default data block (the legacy About/Story/Offerings/Team stack)
  // PLUS every unplaced design block (its demo placeholder copy) — none of which the owner ever sees.
  // FAIL-SAFE: a malformed / absent node parses to null; `?? {}` keeps the grid truthy so the renderer
  // resolves the starter layout instead of dropping to its flat single-column fallback.
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const grid = parseEntityLayout(rawLayout) ?? {}

  // OWNER live preview (ADR-516 Phase D): the person who can manage this Space edits its page from the rail
  // (the in-rail SpacePageBuilder), and this body is the WYSIWYG surface — OwnerSpaceLayoutPreview renders
  // every block once and lets the shared space-layout store rearrange them live. A visitor / non-owner gets
  // the plain server render (SpaceProfileModules), byte-identical to before. Only a manager pays the extra
  // read (OwnerSpaceLayoutPreview re-gates + fails safe to null).
  const caller = await getCallerProfile()
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing

  // INLINE WORKSPACE seam (Stage D1): a manager who soft-navigated to `?panel=<id>` gets that surface
  // rendered INLINE here, REPLACING the profile body, while the (profile) layout's hero + tab menu stay
  // put (the layout does not re-render on a query change). Same gate that picks the owner preview below;
  // only a KNOWN panel id (isPanelId) branches, so an unknown / absent panel falls through to normal.
  // A visitor / non-owner never sees a panel (canSeeAsOwner is false).
  if (canSeeAsOwner && isPanelId(panel)) return <SpaceBodyPanel slug={space.slug} panel={panel} area={area} />

  if (canSeeAsOwner) return <OwnerSpaceLayoutPreview slug={space.slug} />

  return <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
}

export default async function SpaceLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ panel?: string | string[]; area?: string | string[] }>
}) {
  const { slug } = await params
  // The inline-workspace selector (Stage D1). A soft-nav to `?panel=members` swaps only this body — the
  // (profile) layout's hero + menu persist. The body re-gates on manage + a known panel id. `area` scopes
  // the Manage dashboard panel to one management area (?panel=manage&area=community).
  const { panel, area } = await searchParams
  const panelId = typeof panel === 'string' ? panel : undefined
  const areaId = typeof area === 'string' ? area : undefined
  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <SpaceProfileBody slug={slug} panel={panelId} area={areaId} />
    </Suspense>
  )
}
