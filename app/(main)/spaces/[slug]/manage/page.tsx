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
import { hubSearchItems } from '@/lib/admin/modules/space-hub'
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

  // Owner directive: the Manage hub reads like the admin CRM workspace (/admin/crm) — it leads with the
  // SEARCH BAR, then the category MENU, then the section content, with NO big identity hero above them
  // (the space name lives in the breadcrumb + left rail; the active section renders its own header, e.g.
  // the Resonance CRM / Marketing PageHeading). The old DashboardTemplate hero (eyebrow + brand title +
  // description + the members/plan/mode strip) pushed the search + menu far down the page; dropping it puts
  // the menu right under the search, matching the admin workspace exactly. Wide, no on-page Settings bar.
  return (
    <div className="mx-auto w-full max-w-7xl">
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}
      {/* Search first (a fast finder over every tool + setting), then the category menu + section content
          (SpaceManageBoard renders the HubNav tabs + the active section), exactly like the admin workspace. */}
      <div className="mb-5">
        <HubSearch items={hubSearchItems(space.slug)} />
      </div>
      <SpaceManageBoard slug={slug} section={section} />
      {/* Pending "where does this event live" requests a Space steward can approve. Only a manager
          (not a staff previewer) acts on them; the actions re-check steward caps server-side. */}
      {canManage && (
        <Suspense fallback={null}>
          <PlacementApprovals target={{ type: 'space', id: space.id }} />
        </Suspense>
      )}
      {/* Pending co-hosted-event share requests (Events EC3) a Space steward can accept onto their
          calendar. Same manager gate; the actions re-check steward caps server-side. */}
      {canManage && (
        <Suspense fallback={null}>
          <EventShareApprovals spaceId={space.id} />
        </Suspense>
      )}
    </div>
  )
}
