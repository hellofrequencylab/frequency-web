import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { resolveMode } from '@/lib/spaces/modes'
import Link from 'next/link'
import { SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import { Compass, CreditCard, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { PlacementApprovals } from '@/components/events/placement-approvals'
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
  const typeLabel = spaceTypeLabel(space.type)
  const planLabel = SPACE_PLAN_LABEL[asSpacePlan(space.plan)]
  // The Mode + Focus label for the stat row (falls back to the type label when a Space has no Mode).
  const mode = resolveMode(space.type, space.modeVariant)
  const modeLabel = mode ? `${mode.modeLabel}: ${mode.focusLabel}` : typeLabel

  // Member count for the stat row (service-role read, fail-safe to an empty list).
  const members = await listSpaceMembers(space.id)
  const activeMembers = members.filter((m) => m.status === 'active').length

  // Stats sit TIGHT in the header (right of the identity), not as a big StatCard grid. The Mode chip links
  // to the Mode & focus page; a Profile & Settings button opens the header-level settings surface (identity,
  // team, reviews, plan, danger). The on-page "Settings" admin bar is off (the hub owns its own navigation).
  // Tight stats in the header (right of the identity on sm+, a tidy left-aligned wrap on mobile). NO
  // Profile & Settings button — that is a hub tab now, so Plan & Billing is one tap away in the nav. The
  // Mode chip links to the Mode & focus page.
  const headerRight = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end">
      <span className="inline-flex items-center gap-1.5 text-sm text-text">
        <Users className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <b className="font-semibold tabular-nums">{activeMembers}</b>
        <span className="text-muted">members</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-text">
        <CreditCard className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <b className="font-semibold">{planLabel}</b>
      </span>
      <Link
        href={`/spaces/${space.slug}/manage/mode`}
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-text transition-colors hover:text-primary-strong"
      >
        <Compass className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className="truncate">{modeLabel}</span>
      </Link>
    </div>
  )

  return (
    <DashboardTemplate
      eyebrow={`Manage ${typeLabel.toLowerCase()} space`}
      title={brandName}
      description="Your control hub. Browse a category to manage it; changes show up on your space page."
      width="default"
      adminBar={false}
      actions={headerRight}
      banner={staffViewing ? <StaffPreviewBanner spaceName={brandName} /> : undefined}
    >
      {/* The Space search bar, directly under the header rule (a fast finder over every tool + setting). */}
      <HubSearch items={hubSearchItems(space.slug)} />
      <SpaceManageBoard slug={slug} section={section} />
      {/* Pending "where does this event live" requests a Space steward can approve. Only a manager
          (not a staff previewer) acts on them; the actions re-check steward caps server-side. */}
      {canManage && (
        <Suspense fallback={null}>
          <PlacementApprovals target={{ type: 'space', id: space.id }} />
        </Suspense>
      )}
    </DashboardTemplate>
  )
}
