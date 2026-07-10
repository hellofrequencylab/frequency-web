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
import { SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import { Compass, CreditCard, Users } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { PlacementApprovals } from '@/components/events/placement-approvals'
import { SpaceManageBoard } from './manage-board'

// The Space OWNER CONSOLE (ADR-441 EM1-3, the Spaces harmonization slice). The unified
// `/{entity}/[id]/manage` Dashboard surface, brought to Spaces: an owner / admin / editor (or a
// platform janitor previewing) manages their Space here, organized by the SAME 9-category spine the
// circle console uses. As of Space Modes M3 (ADR-461/464) the console serves EVERY provisionable type
// (practitioner, organization, business, coaching, event_space, lab, partner); only root stays on the
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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
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

  // The console serves every provisionable type except coaching (isConsoleSpaceType, the single
  // source of truth shared with spaceManageHref). A type with no console spine keeps using the legacy
  // /spaces/[slug]/settings cockpit, so notFound() routes the owner back to the working cockpit
  // without revealing a half-built surface.
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

  return (
    <DashboardTemplate
      eyebrow={`Manage ${typeLabel.toLowerCase()} space`}
      title={brandName}
      description="Your space's settings in one place. Open a section to manage it; changes show up on your space page."
      width="default"
      banner={staffViewing ? <StaffPreviewBanner spaceName={brandName} /> : undefined}
      stats={
        <>
          <StatCard label="Team members" value={activeMembers} icon={Users} />
          <StatCard label="Plan" value={planLabel} size="sm" icon={CreditCard} />
          {/* The Mode + Focus stat doubles as the entry point to the Mode and focus settings page. */}
          <StatCard
            label="Mode and focus"
            value={modeLabel}
            size="sm"
            icon={Compass}
            href={`/spaces/${space.slug}/manage/mode`}
          />
        </>
      }
    >
      <SpaceManageBoard slug={slug} />
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
