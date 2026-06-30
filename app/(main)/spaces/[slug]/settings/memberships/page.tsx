import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { MembershipTierForm } from '@/components/spaces/membership-tier-form'
import { MembershipOwnerList } from '@/components/spaces/membership-owner-list'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER MEMBERSHIP TIER EDITOR + MEMBERS (ENTITY-SPACES-SYSTEM §2.5, memberships v1). A centered,
// no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/memberships in
// page-chrome.ts, alongside availability). It resolves the Space, gates RENDER on canManage ||
// staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the surface exists),
// then renders:
//   1. the tier editor (setMembershipTiers behind the form), seeded with the current tiers, and
//   2. the owner's current MEMBERS (name + tier + joined date), streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editor is wrapped in a disabled fieldset (read-only). The write action (setMembershipTiers) stays
// gated on canEditProfile server-side, so staff viewing never confers a write. NOTE: the seeded
// tiers + member list (listAllMembershipTiers / listSpaceMemberships) are themselves gated on
// canEditProfile, so a staff viewer sees the editor structure but they read empty.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment. The editor and the description say the
// price is what membership will cost and that paid billing comes later. No em/en dashes.

export const metadata = {
  title: 'Memberships',
}

export default async function SpaceMembershipsPage({
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

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE action (setMembershipTiers) stays gated on
  // canEditProfile, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The default (memberships = editor) reproduces
  // the old canEditProfile threshold; a staff janitor keeps the read-only preview (write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'memberships', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Memberships"
        description="The membership tiers for this space."
        back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Memberships"
          reason={spaceFunctionAccess(space, 'memberships', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const tiers = await listAllMembershipTiers(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Memberships"
      description="Define the tiers members can join. The price is what membership will cost. Joining registers a member, and paid billing comes later."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
            every nested control in the form). `display: contents` keeps it out of the layout box. */}
        <fieldset disabled={staffViewing} className="contents">
          <MembershipTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />
        </fieldset>

        <section>
          <SectionHeader title="Members" />
          <Suspense fallback={<MembersSkeleton />}>
            <MembershipOwnerList spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    </FocusTemplate>
  )
}

// Dimension-matched skeleton for the streamed members list (no CLS, PAGE-FRAMEWORK §5.4).
function MembersSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
