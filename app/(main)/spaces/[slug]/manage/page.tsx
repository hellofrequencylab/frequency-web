import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { PlacementApprovals } from '@/components/events/placement-approvals'
import { EventShareApprovals } from '@/components/events/event-share-approvals'
import { FeatureEventField } from '@/components/events/feature-event-field'
import { SPACE_HUB_SECTIONS, asHubSection, hubSearchItems } from '@/lib/admin/modules/space-hub'
import { AdminPageFrame } from '@/components/frequency/admin/admin-page-frame'
import { HubSearch } from './hub-search'
import { SpaceManageBoard } from './manage-board'

// The Space OWNER CONSOLE (ADR-441 EM1-3, the Spaces harmonization slice). The unified
// `/{entity}/[id]/manage` Dashboard surface, brought to Spaces: an owner / admin / editor (or a
// platform janitor previewing) manages their Space here, organized by the SAME 9-category spine the
// circle console uses. Post the ADR-552 type collapse the provisionable set is just `business` and
// `nonprofit` (plus the hidden `root`), and the console serves BOTH; only `root` stays on the
// existing /spaces/[slug]/settings cockpit. No feature is rebuilt: each section LINKS to the existing
// settings sub-page that already serves it. The console also reads the Space's MODE preset to order the
// sections (module emphasis) and surfaces a Mode and focus settings page.
//
// SECURITY: a Server Component, gated server-side. It resolves the Space, gates RENDER on
// resolveSpaceManageAccess (canManage owner/admin/editor || staffViewing janitor preview), and
// notFound()s for everyone else so a non-manager cannot tell the route exists. Every surface's
// mutation re-checks its OWN gate in its settings sub-page (the per-Space function resolver +
// canEditProfile), so this console gate is UX and the sub-pages stay the authority.

export const metadata: Metadata = {
  title: 'Manage space',
  description: 'Manage your space in one place: its basics, people, and the surfaces it offers.',
  robots: { index: false, follow: false },
}

export default async function SpaceManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ section?: string }>
}) {
  const { slug } = await params
  const { section } = await searchParams
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // GATE: only a manager (owner / admin / editor) or a platform janitor preview reaches the console.
  // notFound (not a redirect) for everyone else: we never reveal the route.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  // The console serves both provisionable types, `business` and `nonprofit` (isConsoleSpaceType, the
  // single source of truth shared with spaceManageHref). The hidden `root` type has no console spine and
  // keeps using the legacy /spaces/[slug]/settings cockpit, so notFound() routes it back to the working
  // cockpit without revealing a half-built surface.
  if (!isConsoleSpaceType(space.type)) notFound()

  const brandName = space.brandName ?? space.name
  const hub = asHubSection(section)
  const tab = SPACE_HUB_SECTIONS.find((s) => s.key === hub)
  const board = <SpaceManageBoard slug={slug} section={section} thumbBar />
  const tail = canManage && (
    <>
      <Suspense fallback={null}>
        <PlacementApprovals target={{ type: 'space', id: space.id }} />
      </Suspense>
      <Suspense fallback={null}>
        <EventShareApprovals spaceId={space.id} />
      </Suspense>
      <FeatureEventField spaceId={space.id} />
    </>
  )
  return (
    <div className="max-md:pb-18">
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      {hub === 'dashboard' || hub === 'resonance' || hub === 'marketing' ? (
        <>
          {board}
          {tail}
        </>
      ) : (
        <AdminPageFrame kicker={brandName} title={tab?.label ?? 'Manage'} meta={tab?.blurb}>
          <HubSearch items={hubSearchItems(space.slug)} />
          {board}
          {tail}
        </AdminPageFrame>
      )}
    </div>
  )
}
