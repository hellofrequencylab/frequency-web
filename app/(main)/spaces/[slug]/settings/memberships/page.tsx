import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { MembershipTierForm } from '@/components/spaces/membership-tier-form'
import { MembershipOwnerList } from '@/components/spaces/membership-owner-list'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER MEMBERSHIP TIER EDITOR + MEMBERS (ENTITY-SPACES-SYSTEM §2.5, memberships v1). A centered,
// no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/memberships in
// page-chrome.ts, alongside availability). It resolves the Space, gates on canEditProfile (404s
// otherwise so a non-editor cannot tell the surface exists), then renders:
//   1. the tier editor (setMembershipTiers behind the form), seeded with the current tiers, and
//   2. the owner's current MEMBERS (name + tier + joined date), streamed behind <Suspense>.
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
  const viewerProfileId = await getMyProfileId()

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate: only an editor+ (owner / admin / editor) may set tiers. 404 (not 403) so the surface
  // never confirms it exists to someone who cannot edit.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const tiers = await listAllMembershipTiers(space.id)
  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Memberships"
      description="Define the tiers members can join. The price is what membership will cost. Joining registers a member, and paid billing comes later."
      back={{ href: `/spaces/${space.slug}/settings`, label: 'Space settings' }}
      width="wide"
    >
      <div className="space-y-8">
        <MembershipTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />

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
